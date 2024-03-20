import { ApplicationCommandOptionType, bold, inlineCode, time } from 'discord.js';
import type { PterodactylBackup, PterodactylBackupListMeta } from 'ptero-client';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { type ServerChoice, config } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { confirmCancelRow, getButtonCollector, mcServerChoice } from '../util/components';
import { Command } from '../util/handler/classes/Command';
import type { ExtendedClient } from '../util/handler/classes/ExtendedClient';
import type { ExtendedInteraction } from '../util/handler/types';
import { formatBytes } from '../util/helpers';
import { LOGGER } from '../util/logger';
import { ptero } from '../util/pterodactyl';

type BackupSubcommand = 'list' | 'create' | 'delete' | 'details';

export const backup = new Command({
	name: 'backup',
	description: 'Control backups on a minecraft server.',
	options: [
		{
			name: 'list',
			description: 'Lists all backups from a minecraft server.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [mcServerChoice],
		},
		{
			name: 'create',
			description: 'Creates a backup on a minecraft server.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				mcServerChoice,
				{
					name: 'name',
					description: 'The name of the backup.',
					type: ApplicationCommandOptionType.String,
					required: false,
				},
				{
					name: 'locked',
					description: 'Whether or not the backup is locked.',
					type: ApplicationCommandOptionType.Boolean,
					required: false,
				},
			],
		},
		{
			name: 'delete',
			description: 'Delete a backup.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				mcServerChoice,
				{
					name: 'backup_id',
					description:
						'The ID of the backup you want to delete. You can get the ID from the list subcommand.',
					type: ApplicationCommandOptionType.String,
					required: true,
				},
			],
		},
		{
			name: 'details',
			description: 'Get details about a backup.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				mcServerChoice,
				{
					name: 'backup_id',
					description:
						'The ID of the backup you want to get the details of. You can get the ID from the list subcommand.',
					type: ApplicationCommandOptionType.String,
					required: true,
				},
			],
		},
	],
	execute: async ({ interaction, args, client }) => {
		await interaction.deferReply();

		const subcommand = args.getSubcommand() as BackupSubcommand;

		const handler = new BackupCommandHandler({
			interaction,
			client,
			serverChoice: args.getString('server', true) as ServerChoice,
		});

		if (!(await handler.init())) return;

		if (subcommand === 'list') {
			await handler.handleList();
			return;
		}

		if (subcommand === 'details') {
			await handler.handleDetails({ backupID: args.getString('backup_id', true) });
			return;
		}

		if (subcommand === 'create') {
			await handler.handleCreate({
				backupName: args.getString('name', false),
				isLocked: args.getBoolean('locked', false),
			});
			return;
		}

		if (subcommand === 'delete') {
			await handler.handleDelete({ backupID: args.getString('backup_id', true) });
			return;
		}
	},
});

class BackupCommandHandler extends BaseKiwiCommandHandler {
	private readonly serverChoice: ServerChoice;

	constructor(options: {
		serverChoice: ServerChoice;
		interaction: ExtendedInteraction;
		client: ExtendedClient;
	}) {
		super({ client: options.client, interaction: options.interaction });

		this.serverChoice = options.serverChoice;
	}

	public async handleList() {
		const backupList = await this.fetchBackupList();

		if (!backupList) {
			await this.interaction.editReply(`Failed to fetch backups for ${this.serverChoice}`);
			return;
		}

		if (!backupList.data.length) {
			await this.interaction.editReply(`No backups found for ${this.serverChoice}`);
			return;
		}

		const backupEntries = backupList.data
			.map((backup) => `${time(backup.created_at, 'f')}\n${bold(backup.name)}`)
			.slice(-20);

		const backupListEmbed = new KoalaEmbedBuilder(this.user, {
			title: `Backup List for ${this.guild.name} ${this.serverChoice}`,
			description: backupEntries.join('\n\n'),
		});

		await this.interaction.editReply({ embeds: [backupListEmbed] });
	}
	public async handleDetails(args: { backupID: string }) {
		const backup = await ptero.backups.getDetails(this.serverID, args.backupID).catch(async (e) => {
			await LOGGER.error(
				e,
				`Failed to fetch backup details with ID ${args.backupID} for ${this.serverChoice}`,
			);
			return null;
		});

		if (!backup) {
			await this.interaction.editReply(
				`Failed to fetch backup details with ID ${args.backupID} for ${this.serverChoice}`,
			);
			return;
		}

		const backupEmbed = new KoalaEmbedBuilder(this.user, {
			title: `Backup Details for ${this.guild.name} ${this.serverChoice}`,
			fields: [
				{ name: 'Name', value: backup.name },
				{
					name: 'UUID',
					value: `${inlineCode(backup.uuid)}`,
				},
				{
					name: 'Size',
					value: formatBytes(backup.bytes),
					inline: true,
				},
				{
					name: 'Successful',
					value: backup.is_successful ? 'true' : 'false',
					inline: true,
				},
				{
					name: 'Locked',
					value: backup.is_locked ? 'true' : 'false',
					inline: true,
				},
				{
					name: 'Created at',
					value: time(backup.created_at, 'f'),
					inline: true,
				},
				{
					name: 'Completed at',
					value: backup.completed_at ? time(backup.completed_at, 'f') : 'Backup not completed.',
					inline: true,
				},
			],
		});

		if (this.guild.iconURL()) {
			backupEmbed.setThumbnail(this.guild.iconURL());
		}

		await this.interaction.editReply({ embeds: [backupEmbed] });
	}
	public async handleCreate(args: { backupName: string | null; isLocked: boolean | null }) {
		const backupLimit = config.mcConfig[this.serverChoice].backupLimit;

		if (backupLimit === 0) {
			await this.interaction.editReply(
				`You can not create a backup for ${this.guild.name} ${this.serverChoice} because this server does not allow backups.`,
			);
			return;
		}

		const backupName =
			args.backupName ?? `Backup with ${this.client.user?.username ?? 'Discord Bot'}`;

		const isLocked = args.isLocked === null ? false : args.isLocked;

		const backupList = await this.fetchBackupList();

		if (!backupList) {
			await this.interaction.editReply(`Failed to fetch backups for ${this.serverChoice}.`);
			return;
		}

		if (backupList.meta.pagination.total < backupLimit) {
			await this.createBackup({ backupName, isLocked });
			return;
		}

		await this.interaction.editReply({
			content: `This command will delete the oldest backup for ${this.guild.name} ${bold(
				this.serverChoice,
			)} because the backup limit is reached for this server. Are you sure you want to continue? This can not be undone!`,
			components: [confirmCancelRow],
		});

		const collector = getButtonCollector(this.interaction);

		if (!collector) {
			const error = new Error('Failed to create message component collector');

			await LOGGER.error(new Error('Failed to create message component collector'));
			await this.interaction.editReply({ content: error.message, components: [] });
			return;
		}

		let hasCollected = false;

		collector.once('collect', async (i) => {
			if (i.customId === 'confirm') {
				hasCollected = true;
				const oldestBackup = backupList.data[backupList.data.length - 1];

				if (!oldestBackup) {
					const error = new Error('Failed to get the oldest backup from the list.');

					await LOGGER.error(error);
					await this.interaction.editReply({ content: error.message, components: [] });
					return;
				}

				const success = await this.deleteBackup(oldestBackup.uuid);

				if (!success) {
					await this.interaction.editReply({
						content: `Failed to delete the oldest backup for ${this.guild.name} ${bold(
							this.serverChoice,
						)}.`,
						components: [],
					});
					return;
				}

				await this.createBackup({ backupName, isLocked });
			}

			if (i.customId === 'cancel') {
				hasCollected = true;
				await this.interaction.editReply({
					content: `Cancelled creating a backup for ${this.guild.name} ${bold(this.serverChoice)}!`,
					components: [],
				});
			}
		});

		if (!hasCollected) {
			collector.once('end', () => {
				this.interaction.editReply({
					content: `Cancelled creating a backup for ${this.guild.name} ${bold(
						this.serverChoice,
					)}! The time to respond has expired.`,
					components: [],
				});
			});
		}
	}
	public async handleDelete(args: { backupID: string }) {
		const success = await this.deleteBackup(args.backupID);

		if (success) {
			await this.interaction.editReply(
				`Successfully deleted backup ${args.backupID} for ${this.serverChoice}`,
			);
			return;
		}

		await this.interaction.editReply(
			`Failed to delete backup ${args.backupID} for ${this.serverChoice}`,
		);
	}

	private get serverID() {
		return config.mcConfig[this.serverChoice].serverId;
	}

	/**
	 * Fetches the backup list for the current serverChoice and returns it.
	 * @sideeffect Logs an error if an error occurred.
	 */
	private async fetchBackupList(): Promise<{
		data: PterodactylBackup[];
		meta: PterodactylBackupListMeta;
	} | null> {
		try {
			const backups = await ptero.backups.list(this.serverID);
			return backups;
		} catch (e) {
			await LOGGER.error(e, `Failed to fetch backups for ${this.serverChoice}`);
			return null;
		}
	}

	/**
	 * Creates a backup with the given options and polls the backup until it is completed.
	 * @sideeffect Logs an error if an error occurred and edits the interaction reply.
	 */
	private async createBackup(options: { backupName: string; isLocked: boolean }): Promise<void> {
		await this.interaction.editReply({ content: 'Creating backup...', components: [] });

		const { backupName, isLocked } = options;

		const backup = await ptero.backups
			.create(this.serverID, {
				backupName,
				locked: isLocked,
			})
			.catch((e) => {
				LOGGER.error(e, `Failed to create backup for ${this.serverChoice}!`);
				return null;
			});

		if (!backup) {
			await this.interaction.editReply(`Failed to create backup for ${this.serverChoice}`);
			return;
		}

		await this.interaction.editReply('Waiting for backup to complete...');

		let attemptCounter = 0;

		while (attemptCounter < 40) {
			const backupDetails = await ptero.backups
				.getDetails(this.serverID, backup.uuid)
				.catch(async (e) => {
					await LOGGER.error(e, `Failed to fetch backup details for ${this.serverChoice}`);
					return null;
				});

			if (!backupDetails) {
				await this.interaction.editReply(
					`Failed to fetch backup details for ${this.serverChoice}. It's possible that the backup was still created. Please check using the list and details subcommands.`,
				);
				return;
			}

			if (backupDetails.completed_at !== null) {
				await this.interaction.editReply(
					`Successfully finished creating backup (${inlineCode(backup.name)}) for ${
						this.serverChoice
					}! Time elapsed: ${attemptCounter * 3} seconds.`,
				);
				return;
			}

			await new Promise((resolve) => setTimeout(resolve, 3000));

			attemptCounter++;
		}

		await this.interaction.editReply(
			`Failed to create backup for ${this.serverChoice}. The backup did not complete in time. Please check it manually.`,
		);
	}

	/**
	 * Deletes the backup with the given ID.
	 * @sideeffect Logs an error if an error occurred.
	 */
	private async deleteBackup(backupID: string): Promise<boolean> {
		try {
			await ptero.backups.delete(this.serverID, backupID);
			return true;
		} catch (e) {
			await LOGGER.error(e, `Failed to delete backup ${backupID} for ${this.serverChoice}`);
			return false;
		}
	}
}
