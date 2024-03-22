import {
	ApplicationCommandOptionType,
	PermissionFlagsBits,
	type User,
	inlineCode,
} from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import MemberModelController from '../database/model/memberModelController';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { displayFormatted, displayTime } from '../util/format';
import { Command } from '../util/handler/classes/Command';
import { escapeMarkdown } from '../util/helpers';
import { LOGGER } from '../util/logger';
import mojangApi from '../util/mojang';

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
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this is not that complex
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const handler = new MemberCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		const subcommand = args.getSubcommand() as 'list' | 'info' | 'add' | 'update' | 'remove';

		if (subcommand === 'list') {
			await handler.handleList();
			return;
		}

		if (subcommand === 'info') {
			const user = args.getUser('member');

			if (!user) {
				await interaction.editReply('You must provide a valid member to get info about.');
				return;
			}

			await handler.handleInfo({ targetUser: user });
			return;
		}

		if (subcommand === 'add' || subcommand === 'update' || subcommand === 'remove') {
			if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
				await interaction.editReply('You must be an Administrator to use this command.');
				return;
			}
		}

		if (subcommand === 'add') {
			const targetUser = args.getUser('member');

			if (!targetUser) {
				await interaction.editReply('You must provide a valid member to add.');
				return;
			}

			await handler.handleAdd({
				targetUser,
				ign: args.getString('ign', true),
				trial: args.getBoolean('trial', true),
				memberSince: args.getString('member_since') ?? new Date().toISOString(),
			});

			return;
		}

		if (subcommand === 'update') {
			const targetUser = args.getUser('member');

			if (!targetUser) {
				await interaction.editReply('You must provide a valid member to update.');
				return;
			}

			await handler.handleUpdate({
				targetUser,
				ign: args.getString('ign'),
				trial: args.getBoolean('trial'),
				memberSince: args.getString('member_since'),
			});

			return;
		}

		if (subcommand === 'remove') {
			const targetUser = args.getUser('member');

			if (!targetUser) {
				await interaction.editReply('You must provide a valid member to remove.');
				return;
			}

			await handler.handleRemove({ targetUser });
			return;
		}
	},
});

class MemberCommandHandler extends BaseKiwiCommandHandler {
	public async handleList() {
		const members = await MemberModelController.getAllMembers().catch(async (e) => {
			await LOGGER.error(e, 'Failed to get all Members from the database');
			return null;
		});

		if (!members) {
			await this.interaction.editReply('Failed to get members from the database.');
			return;
		}

		if (!members.length) {
			await this.interaction.editReply('There are no members in the database.');
		}

		const memberUsers = await this.guild.members
			.fetch({
				user: members.map((member) => member.discord_id),
			})
			.catch(async (e) => {
				await LOGGER.error(e, 'Failed to fetch members from the guild');
				return null;
			});

		if (!memberUsers) {
			await this.interaction.editReply('Failed to fetch members from the guild.');
			return;
		}

		const memberNames = memberUsers
			.sort((a, b) =>
				a.user.username.toLocaleLowerCase().localeCompare(b.user.username.toLocaleLowerCase()),
			)
			.map((member) => {
				return `${escapeMarkdown(member.user.displayName)} (${inlineCode(
					escapeMarkdown(member.user.username),
				)})`;
			})
			.join('\n');

		const embed = new KoalaEmbedBuilder(this.interaction.user, {
			title: `Member List for ${this.guild.name}`,
			description: memberNames,
		});

		if (this.guild.iconURL()) {
			embed.setThumbnail(this.guild.iconURL());
		}

		await this.interaction.editReply({
			embeds: [embed],
		});
	}
	public async handleInfo(args: { targetUser: User }) {
		const memberUser = await this.guild.members.fetch(args.targetUser.id).catch(async (e) => {
			await LOGGER.error(e, 'Failed to fetch member from the guild');
			return null;
		});

		if (!memberUser) {
			await this.interaction.editReply(
				`${displayFormatted(this.user)} is not a member of ${displayFormatted(this.guild)}.`,
			);
			return;
		}

		const dbMember = await MemberModelController.getMember(args.targetUser.id).catch(async (e) => {
			await LOGGER.error(e, 'Failed to get member from the database');
			return null;
		});

		if (!dbMember) {
			await this.interaction.editReply('Failed to get member from the database.');
			return;
		}

		const uuids = dbMember.minecraft_uuids;

		if (!uuids.length) {
			await this.interaction.editReply(
				`${displayFormatted(this.user)} does not seem to have a minecraft account.`,
			);
			return;
		}

		const profiles = await Promise.all(
			dbMember.minecraft_uuids.map((uuid) => {
				return mojangApi.getProfile(uuid);
			}),
		).catch(async (e) => {
			await LOGGER.error(e, 'Failed to get profiles from Mojang API');
			return null;
		});

		if (!profiles || !profiles.length || !profiles[0]) {
			await this.interaction.editReply('Failed to get profiles from Mojang API.');
			return;
		}

		const profileEntries = profiles.map((profile) => {
			return `${escapeMarkdown(profile.name)} (${inlineCode(profile.id)})`;
		});

		const embed = new KoalaEmbedBuilder(this.interaction.user, {
			title: `Member Info for ${args.targetUser.displayName}`,
			thumbnail: {
				url: `https://visage.surgeplay.com/face/256/${profiles[0].id}`,
			},
			fields: [
				{ name: 'Discord ID', value: `${inlineCode(dbMember.discord_id)}` },
				{
					name: 'Minecraft Usernames',
					value: profileEntries.join('\n'),
				},
				{
					name: 'Member Since',
					value: displayTime(dbMember.member_since),
				},
				{
					name: 'Last Updated At',
					value: displayTime(dbMember.updated_at),
				},
				{ name: 'Trial Member', value: dbMember.trial_member ? 'Yes' : 'No' },
			],
		});

		await this.interaction.editReply({
			embeds: [embed],
		});
	}
	public async handleAdd(args: {
		targetUser: User;
		ign: string;
		trial: boolean;
		memberSince: string;
	}) {
		const memberSinceDate = await this.getDateFromString(args.memberSince);

		if (!memberSinceDate) {
			return;
		}

		const profiles = await this.getProfilesFromString(args.ign);

		if (!profiles) {
			return;
		}

		try {
			await MemberModelController.addMember({
				discordID: args.targetUser.id,
				trialMember: args.trial,
				minecraftUUIDs: profiles.map((profile) => profile.id),
				memberSince: memberSinceDate,
			});
		} catch (e) {
			await this.handleCreateMemberError(e);
			return;
		}

		await this.interaction.editReply({
			content: `Successfully added ${displayFormatted(args.targetUser)} to the Memberlist.`,
		});
	}
	public async handleUpdate(args: {
		targetUser: User;
		ign: string | null;
		trial: boolean | null;
		memberSince: string | null;
	}) {
		const previousValues = await MemberModelController.getMember(args.targetUser.id).catch(
			async (e) => {
				await LOGGER.error(e, 'Failed to get member from the database');
				return null;
			},
		);

		if (!previousValues) {
			await this.interaction.editReply('Failed to get member from the database.');
			return;
		}

		let updatedMemberSince: Date | null = null;

		if (args.memberSince) {
			updatedMemberSince = await this.getDateFromString(args.memberSince);
		} else {
			updatedMemberSince = previousValues.member_since;
		}

		if (!updatedMemberSince) {
			return;
		}

		let updatedUUIDs: string[] | null = null;

		if (args.ign) {
			const profiles = await this.getProfilesFromString(args.ign);

			if (!profiles) {
				return;
			}

			updatedUUIDs = profiles.map((profile) => profile.id);
		} else {
			updatedUUIDs = previousValues.minecraft_uuids;
		}

		if (!updatedUUIDs) {
			return;
		}

		let updatedTrialMember: boolean | null = null;

		if (args.trial !== null) {
			updatedTrialMember = args.trial;
		} else {
			updatedTrialMember = previousValues.trial_member;
		}

		try {
			await MemberModelController.updateMember(args.targetUser.id, {
				trialMember: updatedTrialMember,
				memberSince: updatedMemberSince,
				minecraftUUIDs: updatedUUIDs,
			});
		} catch (e) {
			await LOGGER.error(e, 'Failed to update member in the database');
			await this.interaction.editReply('Failed to update member in the database.');
			return;
		}

		await this.interaction.editReply({
			content: `Successfully updated ${displayFormatted(args.targetUser)} in the Memberlist.`,
		});
	}
	public async handleRemove(args: { targetUser: User }) {
		try {
			await MemberModelController.removeMember(args.targetUser.id);
		} catch (e) {
			await LOGGER.error(e, 'Failed to remove member from the database');
			await this.interaction.editReply('Failed to remove member from the database.');
			return;
		}

		await this.interaction.editReply({
			content: `Successfully removed ${displayFormatted(args.targetUser)} from the Memberlist.`,
		});
	}

	private async handleCreateMemberError(e: unknown) {
		if (
			e &&
			e !== null &&
			typeof e === 'object' &&
			'message' in e &&
			typeof e.message === 'string' &&
			e.message.includes('unique constraint')
		) {
			this.interaction.editReply('This member already exists in the database.');
			await LOGGER.warn('Member already exists in the database');
		} else {
			this.interaction.editReply('An error occurred while adding the member to the database.');
			await LOGGER.error(e, 'Error adding member to database');
		}
	}

	/**
	 * Gets the minecraft profiles from a string of IGNs and returns them as an array of objects or null if the string is invalid or the profiles cannot be fetched.
	 * @sideeffect Logs Errors and edits the interaction reply if the string is invalid or the profiles cannot be fetched.
	 */
	private async getProfilesFromString(
		ignString: string,
	): Promise<{ id: string; name: string }[] | null> {
		const igns = ignString.split(',').map((name) => name.trim());

		if (igns.length === 0 || !igns[0]) {
			await this.interaction.editReply('You must provide at least one IGN.');
			return null;
		}

		let profiles: { id: string; name: string }[] | null = null;

		if (igns.length > 1) {
			profiles = await mojangApi.getUUIDs(igns).catch(async (e) => {
				await LOGGER.error(e, 'Failed to get profiles from Mojang API');
				return null;
			});
		} else {
			const profile = await mojangApi.getUUID(igns[0]).catch(async (e) => {
				await LOGGER.error(e, 'Failed to get profile from Mojang API');
				return null;
			});

			if (profile) {
				profiles = [profile];
			}
		}

		if (!profiles || profiles.length !== igns.length) {
			await this.interaction.editReply('Failed to get profiles from Mojang API.');
			return null;
		}

		return profiles;
	}

	/**
	 * Tries to create a Date object from a string.
	 * @sideeffect Logs an error and edits the interaction reply if the date string is invalid.
	 */
	private async getDateFromString(dateTime: string): Promise<Date | null> {
		try {
			return new Date(dateTime);
		} catch (e) {
			await LOGGER.error(e, `Failed to parse date from string: ${dateTime}`);
			await this.interaction.editReply(
				'Failed to parse date from string. Please use the format YYYY-MM-DD.',
			);
			return null;
		}
	}
}
