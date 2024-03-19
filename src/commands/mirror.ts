/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ApplicationCommandOptionType } from 'discord.js';
import { config } from '../config';
import type { ServerChoice } from '../config';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';
import MCStatus from '../util/mcstatus';
import { getServerState, ptero } from '../util/pterodactyl';

export const mirror = new Command({
	name: 'mirror',
	description: 'Copy region files from one server to another.',
	options: [
		{
			name: 'server',
			description: 'Choose wether you want to mirror SMP to Copy or CMP to CMP2.',
			type: ApplicationCommandOptionType.String,
			choices: [
				{
					name: 'survival',
					value: 'survival',
				},
				{
					name: 'creative',
					value: 'creative',
				},
			],
			required: true,
		},
		{
			name: 'dimension',
			description: 'The dimension to mirror.',
			type: ApplicationCommandOptionType.String,
			required: true,
			choices: [
				{
					name: 'overworld',
					value: 'overworld',
				},
				{
					name: 'nether',
					value: 'nether',
				},
				{
					name: 'end',
					value: 'end',
				},
			],
		},
		{
			name: 'regions',
			description:
				'The regions to mirror. Separate multiple regions with a comma. Example: -1.0, 1.-1',
			type: ApplicationCommandOptionType.String,
			required: true,
		},
	],
	execute: async ({ interaction, args }) => {
		await interaction.deferReply();

		const server = args.getString('server', true) as 'survival' | 'creative';
		const dimension = args.getString('dimension', true) as 'overworld' | 'nether' | 'end';
		const regionsArg = args.getString('regions', true);

		const sourceServer = server === 'survival' ? 'smp' : 'cmp';
		const targetServer = server === 'survival' ? 'copy' : 'cmp2';

		try {
			const fileNames = parseMinecraftRegions(regionsArg);

			if (!fileNames || fileNames.length === 0) {
				return interaction.editReply('Please provide valid regions to mirror!');
			}

			if (fileNames.length > 12) {
				return interaction.editReply('You can only mirror 12 regions at a time!');
			}

			await interaction.editReply('Checking if regions exist...');

			if (!(await areRegionsIncluded(fileNames, dimension, sourceServer))) {
				return interaction.editReply('One or more regions do not exist on the source server!');
			}

			await interaction.editReply(
				'User provided regions are valid! Checking if target server is offline...',
			);

			const serverState = await getServerState(targetServer);

			if (serverState !== 'offline') {
				try {
					const playerCount = await getPlayerCount(targetServer);

					if (playerCount === null) {
						return interaction.editReply('Failed to get the current playercount. Aborting... ');
					}

					if (playerCount > 0) {
						return interaction.editReply(
							`There are currently players on ${targetServer}! Please wait until they are all offline before mirroring.`,
						);
					}

					await interaction.editReply('Stopping target server...');

					await stopServerAndWait(targetServer);
				} catch (e) {
					await LOGGER.error(e, 'Failed to get server status.');
					await interaction.editReply('Failed to get server status. Aborting...');
					return;
				}
			}

			await interaction.editReply(
				`Mirroring ${fileNames.length} region file(s) from ${sourceServer} to ${targetServer}...`,
			);

			const mirrorPromises = fileNames.map((fileName) =>
				mirrorRegionFiles(sourceServer, targetServer, dimension, fileName),
			);

			await Promise.all(mirrorPromises);

			await interaction.editReply('All files copied! Starting target server...');

			await startServerAndWait(targetServer);

			return interaction.editReply(
				`Successfully mirrored ${
					fileNames.length
				} region files and started ${targetServer.toUpperCase()}!`,
			);
		} catch (e) {
			LOGGER.error(e, 'Failed to mirror region files.');
			return interaction.editReply('An error occurred while trying to mirror the region files.');
		}
	},
});

type Dimension = 'overworld' | 'nether' | 'end';

async function getPlayerCount(server: ServerChoice): Promise<number | null> {
	const queryResponse = await MCStatus.queryFull(server);

	if (!queryResponse.online) {
		return null;
	}

	const playerList = queryResponse.players;

	if (playerList === null || playerList === undefined) {
		return null;
	}

	return playerList.online;
}

async function mirrorRegionFiles(
	server: ServerChoice,
	targetServer: ServerChoice,
	dimension: Dimension,
	regionName: string,
) {
	const dimensionPath = {
		overworld: '',
		nether: 'DIM-1/',
		end: 'DIM1/',
	}[dimension];

	const fileTypes = ['region', 'entities', 'poi'] as const;
	const filePaths = fileTypes.map((type) => `world/${dimensionPath}${type}/${regionName}`);

	const linkPromises = filePaths.map((path) =>
		ptero.files.getDownloadLink(config.mcConfig[server].serverId, path),
	);

	const links = await Promise.all(linkPromises);

	for (const link of links) {
		if (link === null) {
			throw new Error(`Failed to get download link for ${dimension} region: ${regionName}`);
		}
	}

	const fileFetchAndWritePromises = links.map(async (link, index) => {
		const arrayBuffer = await (await fetch(link)).arrayBuffer();
		const fileBuffer = Buffer.from(arrayBuffer);

		const path = filePaths[index];

		if (!path) {
			throw new Error(`Couldn't get the path for ${dimension} region: ${regionName}`);
		}

		await ptero.files.write(config.mcConfig[targetServer].serverId, path, fileBuffer);
	});

	await Promise.all(fileFetchAndWritePromises);
}

function parseMinecraftRegions(input: string) {
	const regions = input.split(',').map((s) => s.trim());
	const parsedRegions: { x: number; z: number }[] = [];

	for (const region of regions) {
		const parts = region.split('.');

		if (parts.length !== 2) {
			return null;
		}

		const [xStr, zStr] = parts;

		if (!xStr || !zStr) {
			return null;
		}

		const x = Number.parseInt(xStr, 10);
		const z = Number.parseInt(zStr, 10);

		if (Number.isNaN(x) || Number.isNaN(z)) {
			return null;
		}

		parsedRegions.push({ x, z });
	}

	return parsedRegions.map((region) => `r.${region.x}.${region.z}.mca`);
}

async function areRegionsIncluded(
	regionNames: string[],
	dimension: Dimension,
	server: ServerChoice,
) {
	const dimensionPath = {
		overworld: '',
		nether: 'DIM-1/',
		end: 'DIM1/',
	}[dimension];

	const regionFiles = await ptero.files.list(
		config.mcConfig[server].serverId,
		`world/${dimensionPath}region`,
	);

	const regionFileNames = regionFiles.map((file) => file.name);

	return regionNames.every((regionName) => regionFileNames.includes(regionName));
}

async function startServerAndWait(serverChoice: ServerChoice) {
	await ptero.servers.start(config.mcConfig[serverChoice].serverId);

	let serverState = await getServerState(serverChoice);
	let counter = 0;

	while (serverState !== 'running') {
		await new Promise((resolve) => setTimeout(resolve, 2500));
		serverState = await getServerState(serverChoice);
		counter++;

		if (counter > 15) {
			throw new Error('Server failed to start.');
		}
	}
}

async function stopServerAndWait(serverChoice: ServerChoice) {
	await ptero.servers.stop(config.mcConfig[serverChoice].serverId);

	let serverState = await getServerState(serverChoice);
	let counter = 0;

	while (serverState !== 'offline') {
		await new Promise((resolve) => setTimeout(resolve, 2500));
		serverState = await getServerState(serverChoice);
		counter++;

		if (counter > 15) {
			throw new Error('Server failed to stop.');
		}
	}
}
