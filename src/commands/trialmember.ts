import {
	ApplicationCommandOptionType,
	type Client,
	type Guild,
	User,
	userMention,
} from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { type ConfigEmojis, getEmojis } from '../util/components';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { displayFormatted } from '../util/format';
import { config } from '../config';
import { getTextChannelFromConfig } from '../util/helpers';

export const trialmember = new Command({
	name: 'trialmember',
	description: 'Various subcommands for trial members.',
	options: [
		{
			name: 'post_embed',
			description: 'Posts a welcome embed for the trial member in members-general.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'target',
					description: 'The trial member to welcome.',
					type: ApplicationCommandOptionType.User,
					required: true,
				},
			],
		},
	],
	execute: async ({ interaction, client, args }) => {
		const handler = new TrialMemberCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		const subcommand = args.getSubcommand() as 'post_embed';

		if (subcommand === 'post_embed') {
			await handler.handlePostEmbed({ targetUser: args.getUser('target') });
			return;
		}
	},
});

class TrialMemberCommandHandler extends BaseKiwiCommandHandler {
	public async handlePostEmbed(args: { targetUser: User | null }) {
		await this.interaction.deferReply({ ephemeral: true });

		const targetUser = args.targetUser;

		if (!targetUser || !(targetUser instanceof User)) {
			await this.interaction.editReply('Please provide a valid user!');
			return;
		}

		if (!(await this.isTrialMember(targetUser))) {
			await this.interaction.editReply(
				`${displayFormatted(targetUser)} is not a trial member in ${displayFormatted(this.guild)}!`,
			);
			return;
		}

		if (
			!(await sendTrialWelcomeEmbed({
				targetUser,
				client: this.client,
				guild: this.guild,
			}))
		) {
			await this.interaction.editReply(
				`Failed to send trial welcome message to ${displayFormatted(targetUser)}.`,
			);
			return;
		}

		await this.interaction.editReply(`Sent trial information to ${displayFormatted(targetUser)}.`);
	}

	private async isTrialMember(user: User): Promise<boolean> {
		try {
			const member = await this.guild.members.fetch(user.id);
			return member.roles.cache.has(config.roles.trialMember);
		} catch {
			return false;
		}
	}
}

/**
 * Sends a welcome message for a trial member in members-general channel.
 * Returns true if the message was sent successfully.
 * @sideeffect Logs errors.
 */
export async function sendTrialWelcomeEmbed(options: {
	targetUser: User;
	client: Client;
	guild: Guild;
}): Promise<boolean> {
	let emojis: ConfigEmojis | null = null;

	try {
		emojis = getEmojis(options.client);
	} catch (e) {
		await LOGGER.error(e, 'Failed to get emojis');
	}

	if (!emojis) {
		return false;
	}

	const trialEmbed = new KoalaEmbedBuilder(options.targetUser, {
		title: `${emojis.kiwi}  Welcome to ${options.guild.name} ${options.targetUser.displayName}!  ${emojis.kiwi}`,
		thumbnail: {
			url: options.targetUser.displayAvatarURL(),
		},
		fields: [
			{
				name: `${emojis.owoKiwi}  Server Tour`,
				value:
					'Please let us know, when you have time for the server tour. Make sure to take your time, it will most likely take around two hours. You will be whitelisted once the tour starts.',
			},
			{
				name: `${emojis.owoKiwi}  Mods & Resources`,
				value: `On KiwiTech we share our waypoints with a mod that Earthcomputer wrote. You can find it in <#${config.channels.resources}>. Also make sure to put the mod for instamineable deepslate in your mods-folder.`,
			},
			{
				name: `${emojis.owoKiwi}  Server Info`,
				value: `You can find the IPs of our servers in <#${config.channels.serverInfo}>. There is also instructions on how to connect to KiwiTech using KCP. This is especially useful if you live outside of Europe and/or have unstable connection. Make sure to also read the SMP rules.`,
			},
			{
				name: `${emojis.owoKiwi}  Todo on KiwiTech`,
				value: `When you got your trial member role, we also gave you the Kiwi Inc. role. This role gets pinged from time to time to inform active SMP players about new projects or important things to do on our servers. You can check out our <#${config.channels.todo}> to see what needs to be done or bring your own ideas and discuss them with us.`,
			},
			{
				name: '\u200b',
				value: `*The most important thing on KiwiTech is to have fun! If you have any questions, you can always ask us anything in member channels or ingame. We are also active in VC!*  ${emojis.froghypers}`,
			},
		],
	});

	const membersGeneralChannel = await getTextChannelFromConfig(options.guild, 'memberGeneral');

	if (!membersGeneralChannel) {
		return false;
	}

	const message = await membersGeneralChannel
		.send({
			content: userMention(options.targetUser.id),
			embeds: [trialEmbed],
		})
		.catch(async (e) => {
			await LOGGER.error(e, 'Failed to send trial welcome message');
		});

	if (!message) {
		return false;
	}

	try {
		await message.edit({ content: '\u200b' });
	} catch (e) {
		await LOGGER.error(e, 'Failed to edit welcome message');
	}

	return true;
}
