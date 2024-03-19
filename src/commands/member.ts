import { ApplicationCommandOptionType, inlineCode, time } from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import MemberModelController from '../database/model/memberModelController';
import { Command } from '../util/handler/classes/Command';
import { isAdmin } from '../util/helpers';
import { escapeMarkdown } from '../util/helpers';
import MojangAPI from '../util/mojang';

export const member = new Command({
	name: 'member',
	description: 'Command to interact with Members.',
	options: [
		{
			name: 'list',
			description: 'Lists all Members.',
			type: ApplicationCommandOptionType.Subcommand,
		},
		{
			name: 'info',
			description: 'Displays information about a Member.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'member',
					description: 'The Member to display information about.',
					type: ApplicationCommandOptionType.User,
					required: true,
				},
			],
		},
		{
			name: 'add',
			description: 'Add a Member.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'member',
					description: 'The Discord Member to add.',
					type: ApplicationCommandOptionType.User,
					required: true,
				},
				{
					name: 'ign',
					description: "The Member's In-Game Name(s). Separate multiple names with a comma (,).",
					type: ApplicationCommandOptionType.String,
					required: true,
				},
				{
					name: 'trial',
					description: 'Wether the member is a trial Member. Defaults to false.',
					type: ApplicationCommandOptionType.Boolean,
					required: true,
				},
				{
					name: 'member_since',
					description: 'The date the Member joined the server. Format: YYYY-MM-DD',
					type: ApplicationCommandOptionType.String,
				},
			],
		},
		{
			name: 'update',
			description: 'Update a Member.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'member',
					description: 'The Member to update.',
					type: ApplicationCommandOptionType.User,
					required: true,
				},
				{
					name: 'ign',
					description: "The Member's In-Game Name(s). Separate multiple names with a comma (,).",
					type: ApplicationCommandOptionType.String,
				},
				{
					name: 'trial',
					description: 'Wether the member is a trial Member. Defaults to false.',
					type: ApplicationCommandOptionType.Boolean,
				},
				{
					name: 'member_since',
					description: 'The date the Member joined the server. Format: YYYY-MM-DD',
					type: ApplicationCommandOptionType.String,
				},
			],
		},
		{
			name: 'remove',
			description: 'Remove a Member.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'member',
					description: 'The Member to update.',
					type: ApplicationCommandOptionType.User,
					required: true,
				},
			],
		},
	],
	execute: async ({ interaction, args }) => {
		await interaction.deferReply();

		const guild = interaction.guild;

		if (!guild) {
			return interaction.editReply('This command can only be used in a server!');
		}

		const subcommand = args.getSubcommand() as 'list' | 'info' | 'add' | 'update' | 'remove';

		if (subcommand === 'list') {
			const members = await MemberModelController.getAllMembers();

			if (!members.length) {
				return interaction.editReply('No Members found.');
			}

			const memberIDs = members.map((member) => member.discord_id);
			const memberCollection = await guild.members.fetch({ user: memberIDs });

			const embed = new KoalaEmbedBuilder(interaction.user, {
				title: `Member List for ${guild.name}`,
				description: memberCollection
					.map((member) => escapeMarkdown(member.user.username))
					.join('\n'),
			});

			if (guild.iconURL()) {
				embed.setThumbnail(guild.iconURL());
			}

			await interaction.editReply({
				embeds: [embed],
			});
		}

		if (subcommand === 'info') {
			const user = args.getUser('member', true);

			try {
				try {
					await guild.members.fetch(user.id);
				} catch {
					return interaction.editReply(`${user.username} is not a member of ${guild.name}.`);
				}

				const member = await MemberModelController.getMember(user.id);
				const profiles = await getProfiles(member.minecraft_uuids);
				const usernames = profiles.map((profile) => [profile.name, profile.id] as [string, string]);

				if (!usernames[0] || !usernames[0][1]) {
					await interaction.editReply(
						`${escapeMarkdown(user.username)} does not seem to have a minecraft account.`,
					);

					return;
				}

				const skinUrl = `https://crafatar.com/avatars/${usernames[0][1]}?overlay&size=512`;

				const embed = new KoalaEmbedBuilder(interaction.user, {
					title: `Member Info ${escapeMarkdown(user.username)}`,
					thumbnail: {
						url: skinUrl,
					},
					fields: [
						{ name: 'Discord ID', value: `${inlineCode(member.discord_id)}` },
						{
							name: 'Minecraft Usernames',
							value: usernames
								.map(([name, uuid]) => `${escapeMarkdown(name)} (${inlineCode(uuid)})`)
								.join('\n'),
						},
						{
							name: 'Member Since',
							value: `${time(member.member_since, 'D')}\n${time(member.member_since, 'R')}`,
						},
						{
							name: 'Last Updated At',
							value: `${time(member.updated_at, 'D')}\n${time(member.updated_at, 'R')}`,
						},
						{ name: 'Trial Member', value: member.trial_member ? 'Yes' : 'No' },
					],
				});

				await interaction.editReply({
					embeds: [embed],
				});
			} catch {
				interaction.editReply(`${escapeMarkdown(user.username)} is not a member of ${guild.name}.`);
			}
		}

		if (subcommand === 'add' || subcommand === 'update') {
			if (!isAdmin(interaction.member)) {
				return interaction.editReply('You must be an Administrator to use this command.');
			}

			const user = args.getUser('member', true);
			const ign = args.getString('ign');
			const trial = args.getBoolean('trial');
			const memberSince = args.getString('member_since');

			if (subcommand === 'add') {
				if ((await isMemberInDatabase(user.id)) === true) {
					return interaction.editReply({
						content: `${user.username} is already a member of ${guild.name}.`,
					});
				}

				if (!ign) {
					await interaction.editReply('You must provide at least one IGN.');
					return;
				}

				const igns = ign.split(',').map((name) => name.trim());

				if (igns.length === 0) {
					return interaction.editReply('You must provide at least one IGN.');
				}

				const profiles = await MojangAPI.getUUIDs(igns);
				const memberSinceDate = new Date(memberSince ?? new Date().toISOString());

				try {
					await MemberModelController.addMember(
						user.id,
						trial ?? true,
						profiles.map((profile) => profile.id),
						memberSinceDate,
					);

					interaction.editReply({
						content: `Successfully added ${inlineCode(user.username)} to the Memberlist.`,
					});
				} catch {
					interaction.editReply({
						content: `Failed to add ${user.username} to the Memberlist.`,
					});
				}
			}

			if (subcommand === 'update') {
				if (!(await isMemberInDatabase(user.id))) {
					return interaction.editReply(`${user.username} is not a member of ${guild.name}.`);
				}

				let uuids: string[] | undefined = undefined;
				let trialMember: boolean | undefined = undefined;
				let memberSinceDate: Date | undefined = undefined;

				if (ign !== null) {
					const igns = ign.split(',').map((name) => name.trim());
					const profiles = await MojangAPI.getUUIDs(igns);
					uuids = profiles.map((profile) => profile.id);
				}

				if (trial !== null) {
					trialMember = trial;
				}

				if (memberSince !== null) {
					memberSinceDate = new Date(memberSince);
				}

				try {
					await MemberModelController.updateMember(user.id, {
						trialMember,
						memberSince: memberSinceDate,
						minecraftUUIDs: uuids,
					});

					interaction.editReply({
						content: `Successfully updated ${user.username} in the Memberlist.`,
					});
				} catch {
					interaction.editReply({
						content: `Failed to update ${user.username} in the Memberlist.`,
					});
				}
			}
		}

		if (subcommand === 'remove') {
			if (!isAdmin(interaction.member)) {
				return interaction.editReply('You must be an Administrator to use this command.');
			}

			if (!(await isMemberInDatabase(interaction.user.id))) {
				return interaction.editReply(
					`${interaction.user.username} is not a member of ${guild.name}.`,
				);
			}

			const user = args.getUser('member', true);

			try {
				await MemberModelController.removeMember(user.id);

				interaction.editReply(`Successfully removed ${user.username} from the Memberlist.`);
			} catch (err) {
				interaction.editReply(`Failed to remove ${user.username} from ${guild.name}.`);
			}
		}

		return;
	},
});

async function getProfiles(uuids: string[]) {
	const promises = uuids.map((uuid) => MojangAPI.getProfile(uuid));
	return await Promise.all(promises);
}

async function isMemberInDatabase(discordID: string) {
	return (await MemberModelController.getMember(discordID)) !== null;
}
