import { ApplicationCommandOptionType, type Role, type User } from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { config } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { display, displayFormatted, displayTime } from '../util/format';
import { Command } from '../util/handler/classes/Command';
import { escapeMarkdown } from '../util/helpers';
import { LOGGER } from '../util/logger';

export const info = new Command({
	name: 'info',
	description: 'Get information.',
	options: [
		{
			name: 'server',
			description: 'Get information about the Discord Server.',
			type: ApplicationCommandOptionType.Subcommand,
		},
		{
			name: 'user',
			description: 'Get information about a user.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'target',
					description: 'Select a user.',
					type: ApplicationCommandOptionType.User,
					required: true,
				},
			],
		},
		{
			name: 'members',
			description: 'Lists the Members of the Minecraft Servers.',
			type: ApplicationCommandOptionType.Subcommand,
		},
		{
			name: 'admins',
			description: 'Lists the Admins of the Minecraft Servers.',
			type: ApplicationCommandOptionType.Subcommand,
		},
		{
			name: 'avatar',
			description: `Returns a user's avatar image.`,
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'target',
					description: 'Select a user.',
					type: ApplicationCommandOptionType.User,
					required: true,
				},
			],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();
		const subcommand = args.getSubcommand() as 'server' | 'user' | 'members' | 'admins' | 'avatar';

		const handler = new InfoCommandHandler({ interaction, client });
		if (!(await handler.init())) return;

		if (subcommand === 'server') {
			await handler.handleServer();
			return;
		}

		if (subcommand === 'user') {
			const targetUser = args.getUser('target');

			if (!targetUser) {
				await interaction.editReply('Cannot find that user!');
				return;
			}

			await handler.handleUser({ targetUser });
			return;
		}

		if (subcommand === 'members') {
			await handler.handleMembers();
			return;
		}

		if (subcommand === 'admins') {
			await handler.handleAdmins();
			return;
		}

		if (subcommand === 'avatar') {
			const targetUser = args.getUser('target');

			if (!targetUser) {
				await interaction.editReply('Cannot find that user!');
				return;
			}

			await handler.handleAvatar({ targetUser });
			return;
		}
	},
});

class InfoCommandHandler extends BaseKiwiCommandHandler {
	public async handleServer() {
		const inviteLink = await this.guild.invites
			.create(config.channels.invite, {
				maxAge: 0,
				maxUses: 0,
				unique: false,
			})
			.catch(async (e) => {
				await LOGGER.error(e, `Failed to create an invite link for the ${display(this.guild)}`);
				return null;
			});

		if (!inviteLink) {
			await this.interaction.editReply(
				`Failed to create an invite link for the ${display(this.guild)}`,
			);
			return;
		}

		const serverEmbed = new KoalaEmbedBuilder(this.interaction.user, {
			title: `Server Info ${this.guild.name}`,
			fields: [
				{
					name: 'Membercount',
					value: `${this.guild.memberCount}`,
				},
				{
					name: 'Guild created',
					value: displayTime(this.guild.createdAt),
				},
				{
					name: 'Permanent Invite Link',
					value: inviteLink.url,
				},
			],
		});

		if (this.guild.iconURL()) {
			serverEmbed.setThumbnail(this.guild.iconURL());
		}

		await this.interaction.editReply({ embeds: [serverEmbed] });
	}
	public async handleUser(args: { targetUser: User }) {
		const targetUser = args.targetUser;

		const targetMember = await this.guild.members.fetch(args.targetUser.id).catch(() => {
			LOGGER.debug(
				`${display(args.targetUser)} is not a member of ${display(
					this.guild,
				)}. Fetching user info instead.`,
			);
			return null;
		});

		const userEmbed = new KoalaEmbedBuilder(this.interaction.user, {
			title: `User Info ${targetUser.globalName ?? targetUser.username}`,
			thumbnail: {
				url: targetUser.displayAvatarURL(),
			},
			fields: [
				{ name: 'Username', value: targetUser.username, inline: false },
				{ name: 'User ID', value: targetUser.id, inline: false },
				{
					name: 'Joined Discord on',
					value: displayTime(args.targetUser.createdAt),
					inline: true,
				},
			],
		});

		if (targetMember) {
			if (targetMember.joinedAt) {
				userEmbed.addFields({
					name: `Joined ${this.guild.name} on`,
					value: displayTime(targetMember.joinedAt),
					inline: true,
				});
			}

			const roles = targetMember.roles.cache
				.filter((role) => role.id !== this.guild.id)
				.sort((roleA, roleB) => roleB.position - roleA.position)
				.map((role) => `<@&${role.id}>`)
				.join(', ');

			userEmbed.addFields({
				name: 'Roles',
				value: roles.length ? roles : 'None',
				inline: false,
			});
		}
	}
	public async handleMembers() {
		const membersRole = await this.getGuildRole('members');
		if (!membersRole) return;

		const membersEntries = this.getEmbedEntriesForRoleMembers(membersRole);

		const membersEmbed = new KoalaEmbedBuilder(this.interaction.user, {
			title: 'Info Members',
			fields: [
				{
					name: 'Members Count',
					value: `${membersRole.members.size}`,
				},
				{
					name: 'Members List',
					value: membersEntries.join('\n'),
				},
			],
		});

		if (this.guild.iconURL()) {
			membersEmbed.setThumbnail(this.guild.iconURL());
		}

		await this.interaction.editReply({ embeds: [membersEmbed] });
	}
	public async handleAdmins() {
		const adminRole = await this.getGuildRole('admins');
		if (!adminRole) return;

		const adminEntries = this.getEmbedEntriesForRoleMembers(adminRole);

		const adminEmbed = new KoalaEmbedBuilder(this.interaction.user, {
			title: 'Info Admins',
			fields: [
				{
					name: 'Admins List',
					value: adminEntries.join('\n'),
				},
			],
		});

		if (this.guild.iconURL()) {
			adminEmbed.setThumbnail(this.guild.iconURL());
		}

		await this.interaction.editReply({ embeds: [adminEmbed] });
	}
	public async handleAvatar(args: { targetUser: User }) {
		await this.interaction.editReply({ files: [args.targetUser.displayAvatarURL({ size: 4096 })] });
	}

	/**
	 * Returns the role of the specified type from the guild.
	 * @sideeffect Logs errors and edits the interaction reply if there are any errors.
	 */
	private async getGuildRole(role: 'admins' | 'members') {
		const roleId = config.roles[role];

		const guildRole = await this.guild.roles.fetch(roleId).catch(async (e) => {
			await LOGGER.error(
				e,
				`Failed to fetch the ${role} role (${roleId}) of ${display(this.guild)}`,
			);
			return null;
		});

		if (!guildRole) {
			await this.interaction.editReply(
				`Failed to fetch the ${role} role (${roleId}) of ${displayFormatted(this.guild)}`,
			);
			return null;
		}

		return guildRole;
	}

	/**
	 * Returns an array of strings that contain the members of the specified role.
	 * @sideeffect No side effects.
	 */
	private getEmbedEntriesForRoleMembers(role: Role): string[] {
		const members = role.members
			.sort((a, b) => {
				return a.user.username
					.toLocaleLowerCase()
					.localeCompare(b.user.username.toLocaleLowerCase());
			})
			.map((member) => {
				return `${escapeMarkdown(member.user.username)} (${escapeMarkdown(member.user.id)})`;
			});

		return members;
	}
}
