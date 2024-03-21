import { ApplicationCommandOptionType } from 'discord.js';
import { config } from '../config';
import type { ServerChoice } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';
import { ptero } from '../util/pterodactyl';

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
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const handler = new MirrorCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		await handler.handleMirror({
			serverType: args.getString('server', true) as ServerType,
			dimension: args.getString('dimension', true) as Dimension,
			regions: args.getString('regions', true),
		});
	},
});

class MirrorCommandHandler extends BaseKiwiCommandHandler {
	public async handleMirror(args: {
		serverType: ServerType;
		dimension: Dimension;
		regions: string;
	}) {
		const fileNames = this.parseRegions(args.regions);

		if (!fileNames || fileNames.length === 0) {
			await LOGGER.error(new Error('Failed to parse regions'));
			await this.interaction.editReply('Please provide valid regions to mirror!');
			return;
		}

		if (fileNames.length > 12) {
			await this.interaction.editReply('You can only mirror 12 regions at a time!');
			return;
		}

		const sourceServer = args.serverType === 'survival' ? 'smp' : 'cmp';
		const targetServer = args.serverType === 'survival' ? 'copy' : 'cmp2';

		await this.interaction.editReply('Checking if regions exist...');

		if (
			!(await this.doRegionsExist({
				dimension: args.dimension,
				regionFileNames: fileNames,
				serverChoice: sourceServer,
			}))
		) {
			return;
		}

		await this.interaction.editReply(
			'User provided regions are valid! Checking if target server is offline...',
		);

		const serverState = await ptero.servers
			.getResourceUsage(config.mcConfig[targetServer].serverId)
			.catch(async (e) => {
				await LOGGER.error(e, `Failed to get server status for ${targetServer}`);
				return null;
			});

		if (!serverState) {
			await this.interaction.editReply(
				`Failed to get server status for ${targetServer}. Aborted mirror.`,
			);
			return;
		}

		if (serverState.current_state !== 'offline') {
			await this.interaction.editReply(
				`Target server ${targetServer} must be offline to mirror regions. Please stop the server and try again.`,
			);
			return;
		}

		await this.interaction.editReply(
			`Target server ${targetServer} is offline. Starting mirror...`,
		);

		const mirrorSuccess = await this.mirrorRegionFiles({
			originServer: sourceServer,
			targetServer,
			dimension: args.dimension,
			regionNames: fileNames,
		});

		if (!mirrorSuccess) {
			await this.interaction.editReply('Failed to mirror region files.');
			return;
		}

		await this.interaction.editReply(`Successfully mirrored ${fileNames.length} region files!`);
	}

	/**
	 * parses the input string into an array of region file names and returns it or null if the input is invalid
	 */
	private parseRegions(input: string): string[] | null {
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

	/**
	 * Checks if the provided regions exist on the source server
	 * @sideeffect Logs errors and edits the interaction reply if the regions do not exist
	 */
	private async doRegionsExist(options: {
		serverChoice: ServerChoice;
		dimension: Dimension;
		regionFileNames: string[];
	}) {
		const dimensionPath = {
			overworld: '',
			nether: 'DIM-1/',
			end: 'DIM1/',
		}[options.dimension];

		const regionFiles = await ptero.files
			.list(config.mcConfig[options.serverChoice].serverId, `world/${dimensionPath}region`)
			.catch(async (e) => {
				await LOGGER.error(e, `Failed to list region files from ${options.serverChoice}`);
				return null;
			});

		if (!regionFiles || !regionFiles.length) {
			await this.interaction.editReply(`Failed to list region files from ${options.serverChoice}.`);
			return false;
		}

		const regionFileNames = regionFiles.map((file) => file.name);
		const missingRegions = options.regionFileNames.filter(
			(regionFileName) => !regionFileNames.includes(regionFileName),
		);

		if (missingRegions.length > 0) {
			await this.interaction.editReply(
				`The following regions do not exist on ${options.serverChoice}: ${missingRegions.join(
					', ',
				)}`,
			);
			return false;
		}

		return true;
	}

	/**
	 * Mirrors a region file from one server to another.
	 * @throws if anything goes wrong
	 */
	private async mirrorRegionFile(options: {
		originServer: ServerChoice;
		targetServer: ServerChoice;
		dimension: Dimension;
		regionName: string;
	}) {
		const { originServer, targetServer, dimension, regionName } = options;

		const dimensionPath = {
			overworld: '',
			nether: 'DIM-1/',
			end: 'DIM1/',
		}[dimension];

		const filePaths = ['region', 'entities', 'poi'].map(
			(type) => `world/${dimensionPath}${type}/${regionName}`,
		);

		const downloadLinks = await Promise.all(
			filePaths.map((path) =>
				ptero.files.getDownloadLink(config.mcConfig[originServer].serverId, path),
			),
		);

		for (const link of downloadLinks) {
			if (link === null) {
				throw new Error(
					`Failed to get download link for ${dimension} region ${regionName} from ${originServer}`,
				);
			}
		}

		const files = await Promise.all(
			downloadLinks.map(async (link) => {
				const arrayBuffer = await (await fetch(link)).arrayBuffer();
				return Buffer.from(arrayBuffer);
			}),
		);

		await Promise.all(
			files.map((file, index) => {
				const serverId = config.mcConfig[targetServer].serverId;
				const filePath = filePaths[index];

				if (!filePath) {
					throw new Error(`Couldn't get the path for ${dimension} region: ${regionName}`);
				}

				return ptero.files.write(serverId, filePath, file);
			}),
		);
	}

	/**
	 * Mirrors multiple region files from one server to another and returns true if all files were copied successfully
	 * @sideeffect Logs errors.
	 */
	private async mirrorRegionFiles(options: {
		originServer: ServerChoice;
		targetServer: ServerChoice;
		dimension: Dimension;
		regionNames: string[];
	}): Promise<boolean> {
		const { originServer, targetServer, dimension, regionNames } = options;

		try {
			await Promise.all(
				regionNames.map((regionName) =>
					this.mirrorRegionFile({
						originServer,
						targetServer,
						dimension,
						regionName,
					}),
				),
			);

			return true;
		} catch (e) {
			await LOGGER.error(e, 'Failed to mirror region files');
			return false;
		}
	}
}

type ServerType = 'survival' | 'creative';
type Dimension = 'overworld' | 'nether' | 'end';
