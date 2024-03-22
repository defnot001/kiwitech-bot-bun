import { ApplicationCommandOptionType } from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { type ServerChoice, config } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { mcServerChoice } from '../util/components';
import { Command } from '../util/handler/classes/Command';
import type { ExtendedClient } from '../util/handler/classes/ExtendedClient';
import type { ExtendedInteraction } from '../util/handler/types';
import { formatBytes } from '../util/helpers';
import { LOGGER } from '../util/logger';
import { ptero } from '../util/pterodactyl';

export const mcserver = new Command({
	name: 'mcserver',
	description: 'Control a minecraft server.',
	options: [
		{
			name: 'start',
			description: 'Starts a minecraft server.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [mcServerChoice],
		},
		{
			name: 'stop',
			description: 'Stops a minecraft server.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [mcServerChoice],
		},
		{
			name: 'restart',
			description: 'Restarts a minecraft server.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [mcServerChoice],
		},
		{
			name: 'kill',
			description: 'Kills a minecraft server.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [mcServerChoice],
		},
		{
			name: 'stats',
			description: 'Returns the usage statistics of a server.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [mcServerChoice],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const subcommand = args.getSubcommand() as 'start' | 'stop' | 'restart' | 'kill' | 'stats';

		const handler = new McServerCommandHandler({
			interaction,
			client,
			serverChoice: args.getString('server', true) as ServerChoice,
		});

		if (!(await handler.init())) {
			return;
		}

		switch (subcommand) {
			case 'start':
				await handler.handleStart();
				break;
			case 'stop':
				await handler.handleStop();
				break;
			case 'restart':
				await handler.handleRestart();
				break;
			case 'kill':
				await handler.handleKill();
				break;
			case 'stats':
				await handler.handleStats();
				break;
		}
	},
});

class McServerCommandHandler extends BaseKiwiCommandHandler {
	private readonly serverChoice: ServerChoice;
	private readonly serverID: string;

	public constructor(options: {
		serverChoice: ServerChoice;
		interaction: ExtendedInteraction;
		client: ExtendedClient;
	}) {
		super({ client: options.client, interaction: options.interaction });

		this.serverChoice = options.serverChoice;
		this.serverID = config.mcConfig[options.serverChoice].serverId;
	}

	public async handleStart() {
		const serverStats = await this.getServerStats();
		if (!serverStats) {
			return;
		}

		if (serverStats.current_state !== 'offline') {
			await this.interaction.editReply(
				`Cannot start ${this.serverChoice} because it is currently ${serverStats.current_state}!`,
			);
			return;
		}

		try {
			await ptero.servers.start(this.serverID);
		} catch (e) {
			LOGGER.error(e, `Failed to start ${this.serverChoice}`);
			await this.interaction.editReply(`Failed to start ${this.serverChoice}!`);
			return;
		}

		await this.interaction.editReply(`Starting ${this.serverChoice}...`);
		await this.pollServerState({ targetState: 'running' });
	}
	public async handleStop() {
		const serverStats = await this.getServerStats();

		if (!serverStats) {
			return;
		}

		if (serverStats.current_state !== 'running') {
			await this.interaction.editReply(
				`Cannot stop ${this.serverChoice} because it is currently ${serverStats.current_state}!`,
			);
			return;
		}

		try {
			await ptero.servers.stop(this.serverID);
		} catch (e) {
			LOGGER.error(e, `Failed to stop ${this.serverChoice}`);
			await this.interaction.editReply(`Failed to stop ${this.serverChoice}!`);
			return;
		}

		await this.interaction.editReply(`Stopping ${this.serverChoice}...`);
		await this.pollServerState({ targetState: 'offline' });
	}
	public async handleRestart() {
		const serverStats = await this.getServerStats();

		if (!serverStats) {
			return;
		}

		if (serverStats.current_state !== 'running') {
			await this.interaction.editReply(
				`Cannot restart ${this.serverChoice} because it is currently ${serverStats.current_state}!`,
			);
			return;
		}

		try {
			await ptero.servers.restart(this.serverID);
		} catch (e) {
			LOGGER.error(e, `Failed to restart ${this.serverChoice}`);
			await this.interaction.editReply(`Failed to restart ${this.serverChoice}!`);
			return;
		}

		await this.interaction.editReply(`Restarting ${this.serverChoice}...`);
		await this.pollServerState({ targetState: 'running' });
	}
	public async handleKill() {
		const serverStats = await this.getServerStats();

		if (!serverStats) {
			return;
		}

		if (serverStats.current_state !== 'stopping') {
			await this.interaction.editReply(
				`Cannot kill ${this.serverChoice} because it is currently ${serverStats.current_state}!`,
			);
			return;
		}

		try {
			await ptero.servers.kill(this.serverID);
		} catch (e) {
			LOGGER.error(e, `Failed to kill ${this.serverChoice}`);
			await this.interaction.editReply(`Failed to kill ${this.serverChoice}!`);
			return;
		}

		await this.interaction.editReply(`Killing ${this.serverChoice}...`);
		await this.pollServerState({ targetState: 'offline' });
	}
	public async handleStats() {
		const serverStats = await this.getServerStats();

		if (!serverStats) {
			return;
		}

		const statEmbed = new KoalaEmbedBuilder(this.interaction.user, {
			title: `Server Stats ${this.guild.name} ${this.serverChoice}`,
			color: this.getEmbedColorFromServerState(serverStats.current_state),
			fields: [
				{
					name: 'Current State',
					value: serverStats.current_state,
				},
				{
					name: 'Time Since Last Start',
					value: this.formatUptime(serverStats.resources.uptime),
				},
				{
					name: 'CPU Usage',
					value: `${serverStats.resources.cpu_absolute.toFixed(2)}%`,
					inline: true,
				},
				{
					name: 'Memory Usage',
					value: formatBytes(serverStats.resources.memory_bytes),
					inline: true,
				},
				{
					name: 'Disk Usage',
					value: formatBytes(serverStats.resources.disk_bytes),
					inline: true,
				},
			],
		});

		if (this.guild.iconURL()) {
			statEmbed.setThumbnail(this.guild.iconURL());
		}

		await this.interaction.editReply({ embeds: [statEmbed] });
	}

	/**
	 * Polls the server state until it reaches the target state.
	 * @sideeffect Logs Erros and edits the interaction reply with the result of the polling.
	 */
	private async pollServerState(options: { targetState: ServerUsage['current_state'] }) {
		const pollingFailMessage = `Failed to get server usage for polling ${this.serverChoice}. There is a good chance that the server is still starting.`;

		let attemptCounter = 0;

		while (attemptCounter < 40) {
			await new Promise((resolve) => setTimeout(resolve, 3000));

			const serverStats = await ptero.servers.getResourceUsage(this.serverID).catch(async (e) => {
				await LOGGER.error(e, `Failed to get server usage for ${this.serverChoice}`);
				return null;
			});

			if (!serverStats) {
				await this.interaction.editReply(pollingFailMessage);
				return;
			}

			if (serverStats.current_state === options.targetState) {
				await this.interaction.editReply(
					`${this.serverChoice} is now ${options.targetState}! This took ${
						attemptCounter * 3
					} seconds.`,
				);
				return;
			}

			attemptCounter++;
		}

		await this.interaction.editReply(pollingFailMessage);
	}

	/**
	 * Gets the serverStats for the current serverChoice.
	 * @sideeffect Logs errors and edits the interaction reply if the serverStats cannot be retrieved.
	 */
	private async getServerStats(): Promise<ServerUsage | null> {
		const serverUsage = await ptero.servers.getResourceUsage(this.serverID).catch(async (e) => {
			LOGGER.error(e, `Failed to get server usage for ${this.serverChoice}`);
			return null;
		});

		if (!serverUsage) {
			await this.interaction.editReply(`Failed to get server usage for ${this.serverChoice}`);
			return null;
		}

		return serverUsage;
	}

	/**
	 * Returns the time in milliseconds formatted as a human-readable string.
	 */
	private formatUptime(ms: number) {
		const roundTowardsZero = ms > 0 ? Math.floor : Math.ceil;
		const days = roundTowardsZero(ms / 86400000);
		const hours = roundTowardsZero(ms / 3600000) % 24;
		const minutes = roundTowardsZero(ms / 60000) % 60;
		const seconds = roundTowardsZero(ms / 1000) % 60;

		return `${days}d ${hours}h ${minutes}m ${seconds}s`;
	}

	/**
	 * Returns the embed color for the server state.
	 */
	private getEmbedColorFromServerState(state: ServerUsage['current_state']) {
		switch (state) {
			case 'running':
				return config.embedColors.green;
			case 'starting':
				return config.embedColors.yellow;
			case 'stopping':
				return config.embedColors.yellow;
			case 'offline':
				return config.embedColors.none;
		}
	}
}

export type ServerUsage = {
	is_suspended: boolean;
	current_state: 'starting' | 'running' | 'stopping' | 'offline';
	resources: {
		memory_bytes: number;
		cpu_absolute: number;
		disk_bytes: number;
		network_rx_bytes: number;
		network_tx_bytes: number;
		uptime: number;
	};
};
