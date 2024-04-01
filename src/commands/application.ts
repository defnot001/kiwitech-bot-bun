import {
	ApplicationCommandOptionType,
	type Client,
	EmbedBuilder,
	type Message,
	type Snowflake,
	TextChannel,
	type User,
	time,
	userMention,
} from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { config } from '../config';
import ApplicationModelController, {
	type ApplicationInDatabase,
} from '../database/model/applicationModelController';
import MemberModelController from '../database/model/memberModelController';
import { buildApplicationEmbeds, notifyUserApplicationRecieved } from '../events/application';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { type ConfigEmojis, getEmojis } from '../util/components';
import { display, displayFormatted } from '../util/format';
import { Command } from '../util/handler/classes/Command';
import { fetchMessage, fetchUser, getTextChannelFromConfig } from '../util/helpers';
import { LOGGER } from '../util/logger';
import mojangApi from '../util/mojang';
import { sendTrialWelcomeEmbed } from './trialmember';

type ApplicationSubcommand =
	| 'list'
	| 'display_by_id'
	| 'display_latest'
	| 'link'
	| 'create_channel'
	| 'accept'
	| 'deny'
	| 'delete';

type ApplicationListType = 'open' | 'all' | 'closed';

export const application = new Command({
	name: 'application',
	description: 'Manage applications.',
	options: [
		{
			name: 'display_latest',
			description: 'Display the most recent application from a specified user.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'member',
					description: 'The user to display the application for.',
					type: ApplicationCommandOptionType.User,
					required: true,
				},
			],
		},
		{
			name: 'display_by_id',
			description: 'Display an application by ID.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'application_id',
					description: 'The Application ID to display.',
					type: ApplicationCommandOptionType.Integer,
					required: true,
				},
			],
		},
		{
			name: 'link',
			description: 'Link an application to a member.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'application_id',
					description: 'The ID of the application.',
					type: ApplicationCommandOptionType.Integer,
					required: true,
				},
				{
					name: 'member',
					description: 'The member to link the application to.',
					type: ApplicationCommandOptionType.User,
					required: true,
				},
				{
					name: 'message_id',
					description: 'The message ID of the posted application.',
					type: ApplicationCommandOptionType.String,
					required: true,
				},
			],
		},
		{
			name: 'create_channel',
			description: 'Create a channel for an application.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'message_id',
					description: 'The message ID of the posted application.',
					type: ApplicationCommandOptionType.String,
					required: true,
				},
			],
		},
		{
			name: 'list',
			description: 'List the latest applications.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'type',
					description:
						'Wether to list open applications only or all applications. Defaults to open.',
					type: ApplicationCommandOptionType.String,
					required: false,
					choices: [
						{
							name: 'open',
							value: 'open',
						},
						{
							name: 'all',
							value: 'all',
						},
						{
							name: 'closed',
							value: 'closed',
						},
					],
				},
				{
					name: 'amount',
					description:
						'The amount of applications to list. Defaults to 20, which is also the maximum.',
					type: ApplicationCommandOptionType.Integer,
					required: false,
				},
			],
		},
		{
			name: 'accept',
			description: 'Accept an application.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'application_id',
					description: 'The ID of the application.',
					type: ApplicationCommandOptionType.Integer,
					required: true,
				},
			],
		},
		{
			name: 'deny',
			description: 'Deny an application.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'application_id',
					description: 'The ID of the application.',
					type: ApplicationCommandOptionType.Integer,
					required: true,
				},
				{
					name: 'message_id',
					description: 'The message ID of the posted application. This will delete the message.',
					type: ApplicationCommandOptionType.String,
				},
			],
		},
		{
			name: 'delete',
			description: 'Delete an application.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'application_id',
					description: 'The ID of the application.',
					type: ApplicationCommandOptionType.Integer,
					required: true,
				},
				{
					name: 'message_id',
					description: 'The message ID of the posted application. This will delete the message.',
					type: ApplicationCommandOptionType.String,
				},
			],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const subcommand = args.getSubcommand() as ApplicationSubcommand;

		const handler = new ApplicationCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		if (subcommand === 'list') {
			await handler.handleList({
				listType: (args.getString('type', false) ?? 'open') as ApplicationListType,
				amount: args.getInteger('amount') ?? 20,
			});
			return;
		}

		if (subcommand === 'display_by_id') {
			await handler.handleDisplayByID({ applicationID: args.getInteger('application_id', true) });
			return;
		}

		if (subcommand === 'display_latest') {
			const targetUser = args.getUser('member');

			if (!targetUser) {
				await interaction.editReply(`Cannot find user ${targetUser}.`);
				return;
			}

			await handler.handleDisplayLatest({ targetUser });
			return;
		}

		if (subcommand === 'link') {
			await handler.handleLink({
				applicationID: args.getInteger('application_id', true),
				newUser: args.getUser('member', true),
				messageID: args.getString('message_id', true),
			});
			return;
		}

		if (subcommand === 'create_channel') {
			await handler.handleCreateChannel({ messageID: args.getString('message_id', true) });
			return;
		}

		if (subcommand === 'accept') {
			await handler.handleAccept({ applicationID: args.getInteger('application_id', true) });
			return;
		}

		if (subcommand === 'deny') {
			await handler.handleDeny({
				applicationID: args.getInteger('application_id', true),
				messageID: args.getString('message_id', false),
			});
			return;
		}

		if (subcommand === 'delete') {
			await handler.handleDelete({
				applicationID: args.getInteger('application_id', true),
				messageID: args.getString('message_id', false),
			});
			return;
		}
	},
});

class ApplicationCommandHandler extends BaseKiwiCommandHandler {
	public async handleList(args: { listType: ApplicationListType; amount: number }) {
		const applications = await ApplicationModelController.getApplications(
			args.listType,
			args.amount,
		).catch(async (e) => {
			await LOGGER.error(e, 'Failed to get applications');
			return null;
		});

		if (!applications) {
			await this.interaction.editReply('Failed to get applications.');
			return;
		}

		if (applications.length === 0) {
			await this.interaction.editReply('No applications found.');
			return;
		}

		const entries = applications.map((a) => {
			return `Application ID: ${a.id}\nApplicant: ${a.content.discordName}\nTime: ${time(
				a.created_at,
				'D',
			)}`;
		});

		const applicationListEmbed = new KoalaEmbedBuilder(this.user, {
			title: `Latest${args.listType === 'all' ? ' ' : ` ${args.listType} `}applications`,
			description: entries.join('\n\n'),
		});

		await this.interaction.editReply({ embeds: [applicationListEmbed] });
	}
	public async handleDisplayByID(args: { applicationID: number }) {
		const application = await this.getApplicationFromID(args.applicationID);

		if (!application) {
			return;
		}

		const user = application.discord_id
			? await fetchUser(application.discord_id, this.client)
			: null;

		const embeds = buildApplicationEmbeds({
			applicationID: args.applicationID,
			applicationObject: application.content,
			user,
		});

		await this.interaction.editReply({ embeds });
	}
	public async handleDisplayLatest(args: { targetUser: User }) {
		const application = await ApplicationModelController.getLatestApplicationByDiscordID(
			args.targetUser.id,
		).catch(async (e) => {
			await LOGGER.error(
				e,
				`Failed to get latest application for ${displayFormatted(args.targetUser)}`,
			);
			return null;
		});

		if (!application) {
			await this.interaction.editReply(
				`No applications found for user ${displayFormatted(args.targetUser)}.`,
			);
			return;
		}

		const embeds = buildApplicationEmbeds({
			applicationID: application.id,
			applicationObject: application.content,
			user: args.targetUser,
		});

		await this.interaction.editReply({ embeds });
	}
	public async handleLink(args: {
		applicationID: number;
		newUser: User;
		messageID: Snowflake;
	}) {
		const applicationChannel = await this.getApplicationChannel();

		if (!applicationChannel) {
			return;
		}

		const oldMessage = await this.getApplicationMessage(args.messageID, applicationChannel);

		if (!oldMessage) {
			return;
		}

		const updatedApplication = await this.updateApplicationLink({
			applicationID: args.applicationID,
			newUser: args.newUser,
		});

		if (!updatedApplication) {
			await this.interaction.editReply(
				`Failed to update application ID ${args.applicationID} with member ${displayFormatted(
					args.newUser,
				)}.`,
			);
			return;
		}

		const embeds = buildApplicationEmbeds({
			applicationObject: updatedApplication.content,
			applicationID: updatedApplication.id,
			user: args.newUser,
		});

		try {
			await oldMessage.delete();
		} catch (e) {
			await LOGGER.error(
				e,
				`Failed to delete application message with ID ${args.messageID} from ${displayFormatted(
					applicationChannel,
				)}`,
			);
		}

		const postedApp = await applicationChannel.send({ embeds }).catch(async (e) => {
			await LOGGER.error(e, 'Failed to post updated application');
			return null;
		});

		if (!postedApp) {
			await this.interaction.editReply(
				`Failed to post updated application for ID ${args.applicationID} in ${displayFormatted(
					applicationChannel,
				)}. The application has been updated.`,
			);
			return;
		}

		await reactYesNo({ client: this.client, message: postedApp });

		if (!(await notifyUserApplicationRecieved(args.newUser))) {
			await this.interaction.followUp(
				`Failed to notify ${displayFormatted(
					args.newUser,
				)} in DMs that their application was received.`,
			);
		}

		await this.interaction.editReply(
			`Successfully linked application ID ${args.applicationID} to ${displayFormatted(
				args.newUser,
			)}.`,
		);
	}
	public async handleCreateChannel(args: { messageID: Snowflake }) {
		await this.interaction.editReply('Creating channel...');

		const applicationChannel = await this.getApplicationChannel();

		if (!applicationChannel) {
			return;
		}

		const applicationMessage = await this.getApplicationMessage(args.messageID, applicationChannel);

		if (!applicationMessage) {
			return;
		}

		const applicationId = await this.getApplicationIDfromMessage(applicationMessage);

		if (!applicationId) {
			await this.interaction.editReply(
				`Failed to find application ID in message with ID ${args.messageID} in ${displayFormatted(
					applicationChannel,
				)}`,
			);
			return;
		}

		const application = await this.getApplicationFromID(applicationId);

		if (!application) {
			return;
		}

		if (!application.discord_id) {
			await this.interaction.editReply(
				`Application with ID ${applicationId} does not have a linked user.`,
			);
			return;
		}

		const applicantUser = await fetchUser(application.discord_id, this.client);

		if (!applicantUser) {
			await this.interaction.editReply(
				`Failed to find user with ID ${application.discord_id} for application ID ${applicationId}.`,
			);
			return;
		}

		const votingChannel = await getTextChannelFromConfig(this.guild, 'applicationVoting');

		if (!votingChannel) {
			await this.interaction.editReply('Failed to find voting channel.');
			return;
		}

		const newChannel = await this.guild.channels
			.create({
				name: `${applicantUser.username}-application`,
				parent: config.channels.applicationCategory,
			})
			.catch(async (e) => {
				await LOGGER.error(e, `Failed to create channel for ${displayFormatted(applicantUser)}`);
				return null;
			});

		if (!newChannel) {
			await this.interaction.editReply(
				`Failed to create channel for ${displayFormatted(applicantUser)}.`,
			);
			return;
		}

		try {
			await newChannel.permissionOverwrites.create(applicantUser, {
				ViewChannel: true,
				SendMessages: true,
				EmbedLinks: true,
				AttachFiles: true,
				AddReactions: true,
				UseExternalEmojis: true,
				ReadMessageHistory: true,
				MentionEveryone: false,
			});
		} catch (e) {
			await LOGGER.error(e, `Failed to set permissions for ${displayFormatted(applicantUser)}`);
			await this.interaction.followUp(
				`Failed to set permissions for ${displayFormatted(applicantUser)}. Please do so manually.`,
			);
		}

		try {
			await newChannel.send({ embeds: applicationMessage.embeds });
		} catch (e) {
			await LOGGER.error(e, 'Failed to send application message to new channel');
			await this.interaction.followUp(
				'Failed to send application message to new channel. Please do so manually.',
			);
		}

		try {
			await applicationMessage.delete();
		} catch (e) {
			await LOGGER.error(e, 'Failed to delete application message');
			await this.interaction.followUp(
				'Failed to delete application message. Please do so manually.',
			);
		}

		try {
			await newChannel.send(
				`Welcome to your application channel ${userMention(
					applicantUser.id,
				)}! You can use this channel to communicate with the members about your application and share more images and information. Don't hesistate to ask questions! There is a vote active on our application where every member can vote on your application.`,
			);
		} catch (e) {
			await LOGGER.error(e, 'Failed to send welcome message to new channel');
			await this.interaction.followUp(
				'Failed to send welcome message to new channel. Please do so manually.',
			);
		}

		const voteEmbed = new EmbedBuilder({
			author: {
				name: this.interaction.client.user.username,
				icon_url: this.interaction.client.user.displayAvatarURL(),
			},
			description: `Vote on the application from ${userMention(applicantUser.id)}!`,
			color: config.embedColors.default,
			footer: {
				text: `Application ID: ${applicationId}`,
				icon_url: applicantUser.displayAvatarURL(),
			},
			timestamp: new Date(),
		});

		const voteMessage = await votingChannel.send({ embeds: [voteEmbed] }).catch(async (e) => {
			await LOGGER.error(e, 'Failed to send vote message');
			return null;
		});

		if (!voteMessage) {
			await this.interaction.followUp('Failed to send vote message. Please do so manually.');
		}

		if (voteMessage) {
			await reactYesNo({ client: this.client, message: voteMessage });
		}

		await this.interaction.editReply(
			`Successfully created channel ${newChannel} for application ID ${applicationId}.`,
		);
	}
	public async handleAccept(args: { applicationID: number }) {
		await this.interaction.editReply('Accepting application...');

		const application = await this.getApplicationFromID(args.applicationID);

		if (!application) {
			return;
		}

		if (!application.is_open) {
			await this.interaction.editReply(`Application with ID ${args.applicationID} is not open.`);
			return;
		}

		if (!application.discord_id) {
			await this.interaction.editReply(
				`Application with ID ${args.applicationID} does not have a linked user.`,
			);
			return;
		}

		const targetUser = await fetchUser(application.discord_id, this.client);

		if (!targetUser) {
			await this.interaction.editReply(
				`Failed to find user with ID ${application.discord_id} for application ID ${args.applicationID}.`,
			);
			return;
		}

		const applicantChannel = await this.getApplicantChannel(targetUser);

		if (!applicantChannel) {
			await this.interaction.editReply(
				`Application channel for ${displayFormatted(targetUser)} not found.`,
			);
			return;
		}

		try {
			await applicantChannel.send(
				`${userMention(
					targetUser.id,
				)} We are happy to inform you that your application has been accepted. Welcome to the community!`,
			);
		} catch (e) {
			await LOGGER.error(e, `Failed to send welcome message to ${display(applicantChannel)}`);
			await this.interaction.editReply(
				`Failed to send welcome message to ${display(applicantChannel)}.`,
			);
			return;
		}

		await this.setTrialMemberRoles(targetUser);

		try {
			await ApplicationModelController.closeApplication(args.applicationID);
		} catch (e) {
			await LOGGER.error(e, `Failed to close application ID ${args.applicationID}`);
			await this.interaction.followUp(
				`Failed to close application ID ${args.applicationID} from ${displayFormatted(
					targetUser,
				)}. Please do so manually.`,
			);
		}

		const wasSent = await sendTrialWelcomeEmbed({
			client: this.client,
			guild: this.guild,
			targetUser,
		});

		if (!wasSent) {
			await this.interaction.followUp(
				`Failed to send welcome message to ${displayFormatted(targetUser)}. Please do so manually.`,
			);
		}

		const minecraftProfile = await mojangApi
			.getUUID(application.content.ign.trim())
			.catch(async (e) => {
				await LOGGER.error(e, `Failed to get UUID for ${application.content.ign}`);
				return null;
			});

		if (!minecraftProfile) {
			await this.interaction.followUp(
				`Failed to get UUID for IGN ${application.content.ign.trim()} from ${displayFormatted(
					targetUser,
				)}'s application with ID ${application.id}. Please update the member igns manually later.`,
			);
		}

		try {
			if (minecraftProfile) {
				await MemberModelController.addMember({
					discordID: targetUser.id,
					trialMember: true,
					minecraftUUIDs: [minecraftProfile.id],
					memberSince: new Date(),
				});
			} else {
				await MemberModelController.addMember({
					discordID: targetUser.id,
					trialMember: true,
					minecraftUUIDs: [],
					memberSince: new Date(),
				});
			}
		} catch (e) {
			await LOGGER.error(e, `Failed to add member ${displayFormatted(targetUser)}`);
			await this.interaction.followUp(
				`Failed to add member ${displayFormatted(
					targetUser,
				)} to the database. Please do so manually.`,
			);
		}

		await this.interaction.editReply(
			`Successfully accepted application ID ${args.applicationID} from ${displayFormatted(
				targetUser,
			)}.`,
		);
	}
	public async handleDeny(args: {
		applicationID: number;
		messageID: string | null;
	}) {
		await this.interaction.editReply('Denying Application...');

		const application = await this.getApplicationFromID(args.applicationID);

		if (!application) {
			return;
		}

		if (!application.is_open) {
			await this.interaction.editReply(`Application with ID ${args.applicationID} is not open.`);
			return;
		}

		if (!application.discord_id) {
			await this.interaction.editReply(
				`Application with ID ${args.applicationID} does not have a linked user.`,
			);
			return;
		}

		const targetUser = await fetchUser(application.discord_id, this.client);

		if (!targetUser) {
			await this.interaction.editReply(
				`Failed to find user with ID ${application.discord_id} for application ID ${args.applicationID}.`,
			);
			return;
		}

		try {
			await ApplicationModelController.closeApplication(args.applicationID);
		} catch (e) {
			await LOGGER.error(
				e,
				`Failed to close application ID ${args.applicationID} from ${display(targetUser)}`,
			);
			await this.interaction.editReply(
				`Failed to close application ID ${args.applicationID} from ${displayFormatted(
					targetUser,
				)} in the database.`,
			);
			return;
		}

		try {
			await targetUser.send(
				'We are sorry to inform you that your application to KiwiTech has been denied. Thank you again for your interest in our community! Of course you are welcome to stay in our server to chat with members and ask anything that interests you. We wish you the best of luck in your future endeavours!',
			);
		} catch (e) {
			await LOGGER.error(e, `Failed to notify ${display(targetUser)} in DMs`);

			await this.interaction.followUp(
				`Failed to notify ${displayFormatted(
					targetUser,
				)} in DMs that their application was denied. Please do so manually.`,
			);
		}

		await this.interaction.followUp(
			`Notified ${displayFormatted(targetUser)} in DMs that their application was denied.`,
		);

		if (args.messageID) {
			await this.deleteApplicationMessage(args.messageID);
		}

		await this.interaction.editReply(
			`Successfully denied application ID ${args.applicationID} from ${displayFormatted(
				targetUser,
			)}.`,
		);
	}
	public async handleDelete(args: { applicationID: number; messageID: string | null }) {
		await this.interaction.editReply('Deleting Application...');

		try {
			await ApplicationModelController.deleteApplication(args.applicationID);
		} catch (e) {
			await LOGGER.error(e, `Failed to delete application ID ${args.applicationID}`);
			await this.interaction.editReply(`Failed to delete application ID ${args.applicationID}.`);
			return;
		}

		if (args.messageID) {
			await this.deleteApplicationMessage(args.messageID);
		}

		await this.interaction.editReply(`Successfully deleted application ID ${args.applicationID}.`);
	}

	/**
	 * Fetches an application from the database by its ID.
	 * @returns The application, or null if an error occurred.
	 * @sideeffect Edits the interaction reply if an error occurs.
	 */
	private async getApplicationFromID(applicationId: number): Promise<ApplicationInDatabase | null> {
		const application = await ApplicationModelController.getApplication(applicationId).catch(
			async (e) => {
				await LOGGER.error(e, `Failed to get application with ID ${applicationId}`);
				return null;
			},
		);

		if (!application) {
			await this.interaction.editReply(`Application with ID ${applicationId} not found.`);
			return null;
		}

		return application;
	}

	/**
	 * Updates an application with a new user.
	 * @returns The updated application, or null if an error occurred.
	 * @sideeffect Logs the error if one occurs.
	 */
	private async updateApplicationLink(options: {
		applicationID: number;
		newUser: User;
	}): Promise<ApplicationInDatabase | null> {
		const { applicationID, newUser } = options;

		try {
			const updatedApplication = await ApplicationModelController.linkApplication({
				applicationID,
				newUser,
			});

			return updatedApplication;
		} catch (e) {
			await LOGGER.error(
				e,
				`Failed to update application ID ${options.applicationID} with member ${display(newUser)}`,
			);

			return null;
		}
	}

	/**
	 * Fetches the channel where applications are posted in.
	 * @returns The application channel, or null if an error occurred.
	 * @sideeffect Edits the interaction reply if an error occurs.
	 */
	private async getApplicationChannel() {
		const applicationChannel = await getTextChannelFromConfig(this.guild, 'application');

		if (!applicationChannel) {
			await this.interaction.editReply('Failed to find application channel.');
			return null;
		}

		return applicationChannel;
	}

	/**
	 * Fetches an application message from a channel.
	 * @returns The application message, or null if an error occurred.
	 * @sideeffect Edits the interaction reply if an error occurs.
	 */
	private async getApplicationMessage(
		messageID: Snowflake,
		channel: TextChannel,
	): Promise<Message | null> {
		const applicationMessage = await fetchMessage({
			channel,
			messageID,
		});

		if (!applicationMessage) {
			await this.interaction.editReply(
				`Failed to find application message with ID ${messageID} in ${display(channel)}.`,
			);
			return null;
		}

		return applicationMessage;
	}

	/**
	 * Fetches the application ID from a message.
	 * @returns The application ID, or null if an error occurred.
	 */
	private async getApplicationIDfromMessage(message: Message): Promise<number | null> {
		if (!message.embeds || !message.embeds[0] || !message.embeds[1] || !message.embeds[2]) {
			await LOGGER.error(new Error(`Failed to find embeds in message ${message.id}`));
			return null;
		}

		const footerText = message.embeds[0].footer?.text;

		if (!footerText) {
			await LOGGER.error(new Error(`Failed to find footer text in message ${message.id}`));
			return null;
		}

		LOGGER.debug(`Parsing footer text: ${footerText}`);

		const split = footerText.split('|');

		if (!split[1]) {
			await LOGGER.error(new Error(`Failed to find application ID in footer text ${footerText}`));
			return null;
		}

		const replaced = split[1].replace(' ID: ', '');

		if (!replaced) {
			await LOGGER.error(new Error(`Failed to find application ID in footer text ${footerText}`));
			return null;
		}

		let id: number | null;

		try {
			id = Number.parseInt(replaced, 10);
		} catch {
			await LOGGER.error(
				new Error(`Failed to parseInt() application ID in footer text ${footerText}`),
			);
			return null;
		}

		return id;
	}

	/**
	 * Fetches the application channel for a user.
	 * @returns The application channel, or null if an error occurred.
	 * @sideeffect Logs the error if one occurs.
	 */
	private async getApplicantChannel(user: User): Promise<TextChannel | null> {
		try {
			await this.guild.channels.fetch();
		} catch (e) {
			await LOGGER.error(e, `Failed to fetch channels for ${display(this.guild)}`);
			return null;
		}

		const channel =
			this.guild.channels.cache.find((c) => c.name === `${user.username}-application`) ?? null;

		if (!channel) {
			await LOGGER.error(`Failed to find application channel for ${display(user)}`);
		}

		if (!(channel instanceof TextChannel)) {
			await LOGGER.error(`Application channel for ${display(user)} is not a text channel`);
			return null;
		}

		return channel;
	}

	/**
	 * Sets the trial member roles for a user.
	 * @sideeffect Logs the error if one occurs and follows up to the interaction.
	 */
	private async setTrialMemberRoles(targetUser: User) {
		const targetMember = await this.guild.members.fetch(targetUser.id).catch(async (e) => {
			await LOGGER.error(e, `Failed to fetch member ${displayFormatted(targetUser)}`);
			return null;
		});

		if (!targetMember) {
			await this.interaction.followUp(
				`Failed to find member ${displayFormatted(targetUser)}. Please set the roles manually.`,
			);
			return;
		}

		const { trialMember, members, kiwiInc } = config.roles;

		await this.guild.roles.fetch();

		const trialMemberRole = this.guild.roles.cache.get(trialMember);
		const membersRole = this.guild.roles.cache.get(members);
		const kiwiIncRole = this.guild.roles.cache.get(kiwiInc);

		if (!trialMemberRole || !membersRole || !kiwiIncRole) {
			await this.interaction.followUp(
				'Failed to find one or more roles. Please set the roles manually.',
			);
			return;
		}

		try {
			await targetMember.roles.set([trialMemberRole, membersRole, kiwiIncRole]);
		} catch (e) {
			await LOGGER.error(e, `Failed to set roles for ${display(targetUser)}`);
			await this.interaction.followUp(
				`Failed to set trial member roles for ${displayFormatted(
					targetUser,
				)}. Please set the roles manually.`,
			);
		}
	}

	/**
	 * Deletes an application message from the application channel.
	 * @sideeffect Logs the error and follows up to the interaction if something went wrong.
	 */
	private async deleteApplicationMessage(messageId: Snowflake): Promise<void> {
		const applicationChannel = await getTextChannelFromConfig(this.guild, 'application');

		if (!applicationChannel) {
			await this.interaction.followUp(
				'Failed to find application channel to delete the application message. Please do so manually.',
			);
			return;
		}

		const message = await applicationChannel.messages.fetch(messageId).catch(async (e) => {
			await LOGGER.error(
				e,
				`Failed to fetch message with ID ${messageId} from ${display(applicationChannel)}`,
			);
			return null;
		});

		if (!message) {
			await this.interaction.followUp(
				`Failed to find application message with ID ${messageId} in ${display(
					applicationChannel,
				)}. Please delete the message manually.`,
			);

			return;
		}

		try {
			await message.delete();
		} catch (e) {
			await LOGGER.error(
				e,
				`Failed to delete application message with ID ${messageId} from ${display(
					applicationChannel,
				)}`,
			);
			await this.interaction.followUp(
				`Failed to delete application message with ID ${messageId} from ${display(
					applicationChannel,
				)}. Please do so manually.`,
			);
		}
	}
}

/**
 * Reacts to a message with yes and no emojis.
 * @sideeffect Logs the error if one occurs.
 */
export async function reactYesNo(options: { client: Client; message: Message }): Promise<void> {
	let emojis: ConfigEmojis | null = null;

	try {
		emojis = getEmojis(options.client);
	} catch (e) {
		await LOGGER.error(e, 'Failed to get config emojis');
	}

	if (!emojis) {
		return;
	}

	try {
		await options.message.react(emojis.frogYes);
		await options.message.react(emojis.frogNo);
	} catch (e) {
		await LOGGER.error(e, `Failed to react to message ${options.message.id}`);
	}
}
