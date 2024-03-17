import { ApplicationCommandOptionType, TextChannel, bold, inlineCode, time } from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { type ServerChoice, config } from '../config';
import { confirmCancelRow, getButtonCollector, mcServerChoice } from '../util/components';
import { Command } from '../util/handler/classes/Command';
import { formatBytes } from '../util/helpers';
import { LOGGER } from '../util/logger';
import { ptero } from '../util/pterodactyl';

type BackupSubcommand = 'list' | 'create' | 'delete' | 'details';

export default new Command({
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
					name: 'backup',
					description: 'The name of the backup you want to delete.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true,
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
					name: 'backup',
					description: 'The name of the backup you want details from.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true,
				},
			],
		},
	],
	execute: async ({ interaction, args, client }) => {
		await interaction.deferReply();

		const subcommand = args.getSubcommand() as BackupSubcommand;
		const serverChoice = args.getString('server', true) as ServerChoice;
		const { guild: interactionGuild, channel: interactionChannel } = interaction;

		if (!interactionGuild) {
			return interaction.editReply('This command can only be used in a server!');
		}

		if (!interactionChannel || !(interactionChannel instanceof TextChannel)) {
			interaction.editReply('This command can only be used in a text channel.');
			return;
		}

		const { serverId } = config.mcConfig[serverChoice];

		try {
			const { backups, meta } = await getBackups(serverChoice);

			if (subcommand === 'create') {
				const backupLimit = config.mcConfig[serverChoice].backupLimit;

				if (backupLimit === 0) {
					interaction.editReply(
						`You can not create a backup for ${interactionGuild.name} ${bold(
							serverChoice,
						)} because this server does not allow backups.`,
					);
					return;
				}

				const backupName =
					args.getString('name') ??
					`Backup created by ${client.user?.username} at ${new Date().toUTCString()}`;

				if (meta.pagination.total < backupLimit) {
					const backup = await ptero.backups.create(serverId, {
						backupName,
						locked: args.getBoolean('locked') ?? false,
					});

					interaction.editReply(
						`Successfully created backup (${inlineCode(backup.name)}) for ${
							interactionGuild.name
						} ${bold(serverChoice)}!`,
					);

					return;
				}

				await interaction.editReply({
					content: `This command will delete the oldest backup for ${interactionGuild.name} ${bold(
						serverChoice,
					)} because the backup limit is reached for this server. Are you sure you want to continue? This can not be undone!`,
					components: [confirmCancelRow],
				});

				const collector = getButtonCollector(interaction);

				if (!collector) {
					interaction.editReply('Failed to create message component collector!');
					return;
				}

				const oldestBackup = Array.from(backups.values()).pop();

				if (!oldestBackup) {
					interaction.editReply('Something went wrong while trying to delete the oldest backup.');
					return;
				}

				collector.on('collect', async (i) => {
					if (i.customId === 'confirm') {
						await ptero.backups.delete(serverId, oldestBackup.uuid);
						const backup = await ptero.backups.create(serverId, {
							backupName,
							locked: args.getBoolean('locked') ?? false,
						});

						interaction.editReply({
							content: `Successfully deleted oldest backup and created backup (${inlineCode(
								backup.name,
							)}) for ${interactionGuild.name} ${bold(serverChoice)}!`,
							components: [],
						});

						return;
					}

					interaction.editReply({
						content: `Cancelled deleting the oldest backup for ${interactionGuild.name} ${bold(
							serverChoice,
						)}!`,
						components: [],
					});
				});

				return;
			}

			if (subcommand === 'list') {
				const transformedList = Array.from(
					backups,
					([name, backup]) => `${time(backup.created_at, 'f')}\n${bold(name)}`,
				).slice(-20);

				const backupListEmbed = new KoalaEmbedBuilder(interaction.user, {
					title: `Backup List for ${interactionGuild.name} ${serverChoice}`,
					description: transformedList.join('\n\n'),
				});

				interaction.editReply({ embeds: [backupListEmbed] });

				return;
			}

			const backupName = args.getString('backup');

			if (!backupName) {
				interaction.editReply('Please provide a backup name!');
				return;
			}

			const backupDetails = backups.get(backupName);

			if (!backupDetails) {
				interaction.editReply(
					`Could not find a backup with the name ${inlineCode(backupName)} for ${
						interactionGuild.name
					} ${bold(serverChoice)}!`,
				);
				return;
			}

			if (subcommand === 'delete') {
				if (!backupDetails.completed_at) {
					interaction.editReply(
						`Backup ${inlineCode(backupName)} for ${interactionGuild.name} ${bold(
							serverChoice,
						)} is not completed yet!`,
					);
					return;
				}

				if (backupDetails.is_locked) {
					interaction.editReply(
						`Backup ${inlineCode(backupName)} for ${interactionGuild.name} ${bold(
							serverChoice,
						)} is locked!`,
					);
					return;
				}

				await interaction.editReply({
					content: `This command will delete a backup for ${interactionGuild.name} ${bold(
						serverChoice,
					)} Are you sure you want to continue? This can not be undone!`,
					components: [confirmCancelRow],
				});

				const collector = getButtonCollector(interaction);

				if (!collector) {
					interaction.editReply('Failed to created a message collector!');
					return;
				}

				collector.on('collect', async (i) => {
					if (i.customId === 'confirm') {
						await ptero.backups.delete(serverId, backupDetails.uuid);

						interaction.editReply({
							content: `Successfully deleted backup: ${inlineCode(backupDetails.name)} from ${
								interactionGuild.name
							} ${bold(serverChoice)}!`,
							components: [],
						});

						return;
					}

					interaction.editReply({
						content: `Cancelled deleting the backup for ${interactionGuild.name} ${bold(
							serverChoice,
						)}!`,
						components: [],
					});
				});

				return;
			}

			if (subcommand === 'details') {
				const completedTime = backupDetails.completed_at
					? time(backupDetails.completed_at, 'f')
					: 'Backup not completed.';

				const backupEmbed = new KoalaEmbedBuilder(interaction.user, {
					title: `Backup Details for ${interactionGuild.name} ${serverChoice}`,
					fields: [
						{ name: 'Name', value: backupDetails.name },
						{
							name: 'UUID',
							value: `${inlineCode(backupDetails.uuid)}`,
						},
						{
							name: 'Size',
							value: formatBytes(backupDetails.bytes),
							inline: true,
						},
						{
							name: 'Successful',
							value: backupDetails.is_successful ? 'true' : 'false',
							inline: true,
						},
						{
							name: 'Locked',
							value: backupDetails.is_locked ? 'true' : 'false',
							inline: true,
						},
						{
							name: 'Created at',
							value: time(backupDetails.created_at, 'f'),
							inline: true,
						},
						{
							name: 'Completed at',
							value: completedTime,
							inline: true,
						},
					],
				});

				// we have to check if the guild has an icon because there is no method that provides a default icon.
				if (interactionGuild.iconURL()) {
					backupEmbed.setThumbnail(interactionGuild.iconURL());
				}

				interaction.editReply({ embeds: [backupEmbed] });

				return;
			}
		} catch (e) {
			await LOGGER.error(e, 'Failed to execute backup command.');
		}

		return;
	},
});

async function getBackups(serverChoice: ServerChoice) {
	const backups = await ptero.backups.list(config.mcConfig[serverChoice].serverId);
	const backupMap = new Map(backups.data.reverse().map((backup) => [backup.name, backup]));

	return {
		backups: backupMap,
		meta: backups.meta,
	};
}
