import { ApplicationCommandOptionType } from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { type ServerChoice, config } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { Command } from '../util/handler/classes/Command';
import { getServerChoices } from '../util/helpers';
import { LOGGER } from '../util/logger';
import MCStatus from '../util/mcstatus';
import { ptero } from '../util/pterodactyl';
import RCONUtil from '../util/rcon';

export const status = new Command({
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
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const handler = new StatusCommandHandler({ interaction, client });
		if (!(await handler.init())) {
			return;
		}

		await handler.handleStatus({
			serverChoice: args.getString('server', true) as ServerChoice,
		});
	},
});

class StatusCommandHandler extends BaseKiwiCommandHandler {
	public async handleStatus(args: { serverChoice: ServerChoice }) {
		const serverState = await this.getServerState(args);

		if (!serverState) {
			return;
		}

		if (serverState !== 'running') {
			await this.interaction.editReply(`Server is currently ${serverState}!`);
			return;
		}

		const mcStatus = await MCStatus.queryFull(args.serverChoice).catch(async (e) => {
			await LOGGER.error(e, `Failed to get status for ${args.serverChoice}`);
			return null;
		});

		if (!mcStatus) {
			await this.interaction.editReply(`Failed to get status for ${args.serverChoice}!`);
			return;
		}

		const serverMetrics = await this.getServerMetrics(args).catch(async (e) => {
			await LOGGER.error(e, `Failed to get metrics for ${args.serverChoice}`);
			return null;
		});

		if (!serverMetrics) {
			await this.interaction.editReply(`Failed to get metrics for ${args.serverChoice}!`);
			return;
		}

		const playerlist =
			serverMetrics.players.playerList.length > 0
				? serverMetrics.players.playerList.join('\n')
				: 'There is currently nobody online.';

		const statusEmbed = new KoalaEmbedBuilder(this.interaction.user, {
			title: `${this.guild.name} ${args.serverChoice}`,
			color: config.embedColors.green,
			fields: [
				{ name: 'Status', value: 'Online' },
				{ name: 'Version', value: `${mcStatus.version?.name_clean ?? 'no version found'}` },
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

		if (this.guild.iconURL()) {
			statusEmbed.setThumbnail(this.guild.iconURL());
		}

		await this.interaction.editReply({ embeds: [statusEmbed] });
	}

	/**
	 * Get the server state of a server.
	 * Returns the server state or null if the request failed.
	 * @sideeffect Logs errors.
	 */
	private async getServerState(options: {
		serverChoice: ServerChoice;
	}): Promise<ServerState | null> {
		const response = await ptero.servers
			.getResourceUsage(config.mcConfig[options.serverChoice].serverId)
			.catch(async (e) => {
				await LOGGER.error(e, `Failed to get resource usage for ${options.serverChoice}`);
				return null;
			});

		if (!response) {
			return null;
		}

		return response.current_state;
	}

	/**
	 * Get the server metrics of a server.
	 * Returns the server metrics or null if the request failed.
	 * @sideeffect Logs errors.
	 */
	private async getServerMetrics(options: {
		serverChoice: ServerChoice;
	}): Promise<ServerMetrics | null> {
		const commands: string[] = [];

		for (const dimension of MINECRAFT_DIMENSIONS) {
			commands.push(`execute in minecraft:${dimension} run script run get_mob_counts('monster')`);
		}

		commands.push("script run reduce(system_info('server_last_tick_times'), _a+_, 0)/100", 'list');

		const response = await RCONUtil.runMultipleCommands(options.serverChoice, commands).catch(
			async (e) => {
				await LOGGER.error(e, `Failed to get server metrics for ${options.serverChoice}`);
				return null;
			},
		);

		if (!response) {
			return null;
		}

		const listResponse = response.pop();
		const performanceResponse = response.pop();
		const mobcapResponse = response;

		if (!listResponse) {
			await LOGGER.error(new Error(`Failed to get list response for ${options.serverChoice}`));
			return null;
		}

		if (!performanceResponse) {
			await LOGGER.error(
				new Error(`Failed to get performance response for ${options.serverChoice}`),
			);
			return null;
		}

		if (mobcapResponse.length !== 3) {
			await LOGGER.error(new Error(`Failed to get mobcap responses for ${options.serverChoice}`));
			return null;
		}

		const performance = this.parsePerformance(performanceResponse);

		if (!performance) {
			await LOGGER.error(
				new Error(`Failed to parse performance response for ${options.serverChoice}`),
			);
			return null;
		}

		const mobcaps = this.parseMobcaps(mobcapResponse);

		if (!mobcaps) {
			await LOGGER.error(new Error(`Failed to parse mobcap responses for ${options.serverChoice}`));
			return null;
		}

		const players = this.getOnlinePlayers(listResponse);

		if (!players) {
			await LOGGER.error(new Error(`Failed to parse online players for ${options.serverChoice}`));
			return null;
		}

		return {
			performance,
			mobcaps,
			players,
		};
	}

	private parsePerformance(rconResponse: string): ServerPerformance | null {
		const splitNumbers = rconResponse.split(' ')[2];

		if (!splitNumbers) {
			return null;
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

	private parseMobcaps(mobcapResponse: string[]): DimensionMobcaps | null {
		const replaced: string[] = [];

		for (const res of mobcapResponse) {
			replaced.push(res.replace(/^.{0,3}| \(.*\)|[[\]]/g, '').replace(/, /g, ' | '));
		}

		if (!replaced[0] || !replaced[1] || !replaced[2]) {
			return null;
		}

		return {
			overworld: replaced[0],
			the_nether: replaced[1],
			the_end: replaced[2],
		};
	}

	private getOnlinePlayers(listResponse: string): OnlinePlayers | null {
		const splitWords = listResponse.split(' ');

		if (splitWords.length < 8 || !splitWords[2] || !splitWords[7]) {
			return null;
		}

		try {
			const count = Number.parseInt(splitWords[2]);
			const max = Number.parseInt(splitWords[7]);

			let playerList: string[] = [];

			if (count > 0) {
				const splitResponse = listResponse.split(': ')[1]?.split(', ');

				if (!splitResponse) {
					return null;
				}

				playerList = splitResponse;
			}

			return {
				count,
				max,
				playerList,
			};
		} catch {
			return null;
		}
	}
}

const MINECRAFT_DIMENSIONS = ['overworld', 'the_nether', 'the_end'] as const;
type ServerState = 'starting' | 'running' | 'stopping' | 'offline';

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
