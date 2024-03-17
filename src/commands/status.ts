import { ApplicationCommandOptionType } from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { type ServerChoice, config } from '../config';
import { ERROR_MESSAGES } from '../util/constants';
import { Command } from '../util/handler/classes/Command';
import { getServerChoices } from '../util/helpers';
import { LOGGER } from '../util/logger';
import MCStatus from '../util/mcstatus';
import { getServerState } from '../util/pterodactyl';
import RCONUtil from '../util/rcon';

export default new Command({
	name: 'status',
	description: 'Get the status of a Minecraft Server.',
	options: [
		{
			name: 'server',
			description: 'Choose a server.',
			type: ApplicationCommandOptionType.String,
			required: true,
			choices: [...getServerChoices()],
		},
	],
	execute: async ({ interaction, args }) => {
		await interaction.deferReply();

		const server = args.getString('server', true) as ServerChoice;

		if (!server) {
			return interaction.editReply('Please specify a server!');
		}

		if (!interaction.guild) {
			return interaction.reply(ERROR_MESSAGES.ONLY_GUILD);
		}

		try {
			const serverState = await getServerState(server);

			if (serverState !== 'running') {
				return interaction.editReply(`Server is currently ${serverState}!`);
			}

			const status = await MCStatus.queryFull(server);
			const serverMetrics = await getServerMetrics(server);

			const playerlist =
				serverMetrics.players.playerList.join('\n') || 'There is currently nobody online.';

			const statusEmbed = new KoalaEmbedBuilder(interaction.user, {
				title: `${interaction.guild.name} ${server.toUpperCase()}`,
				color: config.embedColors.green,
				fields: [
					{ name: 'Status', value: 'Online' },
					{ name: 'Version', value: `${status.version?.name_clean}` },
					{
						name: 'Performance',
						value: `**${serverMetrics.performance.mspt}** MSPT | **${serverMetrics.performance.tps}** TPS`,
					},
					{
						name: 'Hostile Mobcaps',
						value: `Overworld: ${serverMetrics.mobcaps.overworld}\nThe Nether: ${serverMetrics.mobcaps.the_nether}\nThe End: ${serverMetrics.mobcaps.the_end}`,
					},
					{
						name: 'Playercount',
						value: `online: **${serverMetrics.players.count}** | max: **${serverMetrics.players.max}**`,
					},
					{
						name: 'Playerlist',
						value: playerlist,
					},
				],
			});

			const { mspt } = serverMetrics.performance;

			if (mspt >= 30 && mspt < 40) {
				statusEmbed.setColor(config.embedColors.yellow);
			} else if (mspt >= 40 && mspt < 50) {
				statusEmbed.setColor(config.embedColors.orange);
			} else if (mspt >= 50) {
				statusEmbed.setColor(config.embedColors.red);
			}

			const guildIcon = interaction.guild.iconURL();

			if (guildIcon) {
				statusEmbed.setThumbnail(guildIcon);
			}

			return interaction.editReply({ embeds: [statusEmbed] });
		} catch (e) {
			await LOGGER.error(e, 'Failed to get server status.');
			return interaction.editReply('Failed to get server status.');
		}
	},
});

const MINECRAFT_DIMENSIONS = ['overworld', 'the_nether', 'the_end'] as const;
type MinecraftDimension = (typeof MINECRAFT_DIMENSIONS)[number];
type DimensionMobcaps = {
	[K in MinecraftDimension]: string;
};
type ServerPerformance = {
	mspt: number;
	tps: number;
};
type OnlinePlayers = {
	count: number;
	max: number;
	playerList: string[];
};
type ServerMetrics = {
	mobcaps: DimensionMobcaps;
	performance: ServerPerformance;
	players: OnlinePlayers;
};

async function getServerMetrics(server: ServerChoice): Promise<ServerMetrics> {
	const commands: string[] = [];

	for (const dimension of MINECRAFT_DIMENSIONS) {
		commands.push(`execute in minecraft:${dimension} run script run get_mob_counts('monster')`);
	}

	commands.push(`script run reduce(system_info('server_last_tick_times'), _a+_, 0)/100`);

	commands.push('list');

	const response = await RCONUtil.runMultipleCommands(server, commands);

	const listResponse = response.pop();
	const performanceResponse = response.pop();
	const mobcapResponse = response;

	if (!listResponse) {
		throw new Error(`Failed to query the playerlist for ${server}`);
	}

	if (!performanceResponse) {
		throw new Error(`Failed to query server performance for ${server}`);
	}

	return {
		mobcaps: getMobcaps(mobcapResponse),
		performance: getPerformance(performanceResponse),
		players: getOnlinePlayers(listResponse),
	};
}

function getPerformance(rconResponse: string): ServerPerformance {
	const splitNumbers = rconResponse.split(' ')[2];

	if (!splitNumbers) {
		throw new Error('Failed to parse server data');
	}

	const mspt = Math.round(Number.parseFloat(splitNumbers) * 100) / 100;

	let tps: number;

	if (mspt <= 50) {
		tps = 20;
	} else {
		tps = Math.round((1000 / mspt) * 10) / 10;
	}

	return { mspt, tps };
}

function getMobcaps(rconResponses: string[]): DimensionMobcaps {
	if (rconResponses.length !== 3) {
		throw new Error('Failed to parse mobcaps because of unexpected server response data');
	}

	const replaced = [];

	for (const res of rconResponses) {
		replaced.push(res.replace(/^.{0,3}| \(.*\)|[[\]]/g, '').replace(/, /g, ' | '));
	}

	if (!replaced[0] || !replaced[1] || !replaced[2]) {
		throw new Error('Failed to parse mobcaps because of unexpected server response data');
	}

	return {
		overworld: replaced[0],
		the_nether: replaced[1],
		the_end: replaced[2],
	};
}

function getOnlinePlayers(listResponse: string): OnlinePlayers {
	const splitWords = listResponse.split(' ');

	if (splitWords.length < 8 || !splitWords[2] || !splitWords[7]) {
		throw new Error('Failed to parse playerlist because of unexpected server response data');
	}

	const count = Number.parseInt(splitWords[2]);
	const max = Number.parseInt(splitWords[7]);
	let playerList: string[] = [];

	if (count > 0) {
		const splitResponse = listResponse.split(': ')[1]?.split(', ');

		if (!splitResponse) {
			throw new Error('Failed to parse playerlist because of unexpected server response data');
		}

		playerList = splitResponse;
	}

	return {
		count,
		max,
		playerList,
	};
}
