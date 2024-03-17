import {
	ApplicationCommandOptionType,
	type Client,
	EmbedBuilder,
	type Guild,
	type GuildChannelManager,
	type GuildMember,
	type Snowflake,
	type User,
	time,
	userMention,
} from 'discord.js';
import { getTrialWelcomeMessage } from '../assets/welcomeMessage';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { config } from '../config';
import ApplicationModelController, {
	type ApplicationInDatabase,
} from '../database/model/applicationModelController';
import MemberModelController from '../database/model/memberModelController';
import {
	type ApplicationObject,
	getApplicationEmbeds,
	notifyUserApplicationRecieved,
} from '../util/application';
import { getEmojis } from '../util/components';
import { ERROR_MESSAGES } from '../util/constants';
import { Command } from '../util/handler/classes/Command';
import type { ExtendedInteraction } from '../util/handler/types';
import { LOGGER } from '../util/logger';
import { getTextChannelFromID } from '../util/loggers';

type ApplicationSubcommand =
	| 'display_latest'
	| 'display_by_id'
	| 'link'
	| 'create_channel'
	| 'list'
	| 'delete'
	| 'accept'
	| 'deny';

export default new Command({
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
					name: 'application_id',
					description: 'The ID of the application.',
					type: ApplicationCommandOptionType.Integer,
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
	execute: async ({ interaction, args }) => {
		try {
			await interaction.deferReply();

			const subcommand = args.getSubcommand() as ApplicationSubcommand;

			if (!interaction.guild) {
				return interaction.editReply(ERROR_MESSAGES.ONLY_GUILD);
			}

			if (subcommand === 'link') {
				const targetUser = args.getUser('member', true);
				const applicationID = args.getInteger('application_id', true);
				const messageID = args.getString('message_id', true);
				const application = await ApplicationModelController.getApplication(applicationID);

				if (!application) {
					await interaction.editReply(`Application with ID ${applicationID} not found.`);
					return;
				}

				const updatedApplication = await updateApplicationLink(
					applicationID,
					application,
					targetUser,
				);

				if (!updatedApplication) {
					await interaction.editReply(
						`Failed to update application ID ${applicationID} with member ${targetUser.username}.`,
					);

					return;
				}

				try {
					const applicationChannel = await getTextChannelFromID(interaction.guild, 'application');
					const message = await applicationChannel.messages.fetch(messageID);
					await message.delete();

					const embeds = getApplicationEmbeds(
						updatedApplication.content,
						updatedApplication.id,
						targetUser,
					);

					const postedApp = await applicationChannel.send({ embeds });
					const emojis = getEmojis(interaction.client);

					await postedApp.react(emojis.frogYes);
					await postedApp.react(emojis.frogNo);

					await notifyUserApplicationRecieved(targetUser, interaction.client.user);

					await interaction.editReply(
						`Successfully linked application ID ${applicationID} to ${targetUser.username}.`,
					);
				} catch (e) {
					await LOGGER.error(e, `Failed to delete application message for ID ${applicationID}.`);
				}

				return;
			}

			if (subcommand === 'display_by_id') {
				const applicationID = args.getInteger('application_id', true);
				const application = await ApplicationModelController.getApplication(applicationID);

				if (!application) {
					return interaction.editReply(`Application with ID ${applicationID} not found.`);
				}

				const user = application.discord_id
					? await interaction.client.users.fetch(application.discord_id)
					: undefined;

				const embeds = getApplicationEmbeds(application.content, application.id, user);

				await interaction.editReply({ embeds });
			}

			if (subcommand === 'display_latest') {
				const targetUser = args.getUser('member');

				if (!targetUser) {
					return interaction.editReply(`Cannot find user ${targetUser}.`);
				}

				const application = await ApplicationModelController.getLatestApplicationByDiscordID(
					targetUser.id,
				);
				const embeds = getApplicationEmbeds(application.content, application.id, targetUser);

				await interaction.editReply({ embeds });
			}

			if (subcommand === 'create_channel') {
				const applicationID = args.getInteger('application_id', true);
				const messageID = args.getString('message_id', true);

				try {
					const application = await ApplicationModelController.getApplication(applicationID);

					if (!application) {
						return interaction.editReply(`Application with ID ${applicationID} not found.`);
					}

					if (!application.discord_id) {
						return interaction.editReply(
							`Application with ID ${applicationID} does not have a linked user.`,
						);
					}

					const applicant = await interaction.client.users.fetch(application.discord_id);
					const applicationChannel = await getTextChannelFromID(interaction.guild, 'application');
					const votingChannel = await getTextChannelFromID(interaction.guild, 'applicationVoting');
					const applicationMessage = await applicationChannel.messages.fetch(messageID);

					const newChannel = await interaction.guild.channels.create({
						name: `${applicant.username}-application`,
						parent: config.channels.applicationCategory,
					});

					await newChannel.permissionOverwrites.create(applicant, {
						ViewChannel: true,
						SendMessages: true,
						EmbedLinks: true,
						AttachFiles: true,
						AddReactions: true,
						UseExternalEmojis: true,
						ReadMessageHistory: true,
						MentionEveryone: false,
					});

					await applicationMessage.delete();

					const embeds = getApplicationEmbeds(application.content, application.id, applicant);

					await newChannel.send({ embeds });
					await newChannel.send(getWelcomeMessage(applicant));

					const voteEmbed = new EmbedBuilder({
						author: {
							name: interaction.client.user.username,
							icon_url: interaction.client.user.displayAvatarURL(),
						},
						description: `Vote on the application from ${userMention(applicant.id)}!`,
						color: config.embedColors.default,
						footer: {
							text: `Application ID: ${applicationID}`,
							icon_url: applicant.displayAvatarURL(),
						},
						timestamp: new Date(),
					});

					await votingChannel.send({ embeds: [voteEmbed] });

					await interaction.editReply(
						`Successfully created channel ${newChannel} for application ID ${applicationID}.`,
					);
				} catch (e) {
					await LOGGER.error(e, `Failed to create application channel for ID ${applicationID}.`);
				}

				return;
			}

			if (subcommand === 'list') {
				const listType = (args.getString('type', false) ?? 'open') as 'open' | 'all';
				const amount = args.getInteger('amount') ?? 20;

				const applications = await ApplicationModelController.getApplications(listType, amount);

				const display = applications.map((a) => {
					return `Application ID: ${a.id}\nApplicant: ${a.content.discordName}\nTime: ${time(
						a.created_at,
						'D',
					)}`;
				});

				const applicationListEmbed = new KoalaEmbedBuilder(interaction.user, {
					title: `Latest${listType === 'open' ? 'open ' : ' '}applications`,
					description: display.join('\n\n'),
				});

				return interaction.editReply({ embeds: [applicationListEmbed] });
			}

			if (subcommand === 'delete') {
				const applicationID = args.getInteger('application_id', true);
				const messageID = args.getString('message_id', false);

				try {
					await ApplicationModelController.deleteApplication(applicationID);

					if (messageID) {
						const applicationChannel = await getTextChannelFromID(interaction.guild, 'application');
						const message = await applicationChannel.messages.fetch(messageID);
						await message.delete();
					}

					await interaction.editReply(`Successfully deleted application ID ${applicationID}.`);
				} catch {
					await interaction.editReply(`Failed to delete application ID ${applicationID}.`);
				}
			}

			if (subcommand === 'accept') {
				const applicationID = args.getInteger('application_id', true);
				const application = await ApplicationModelController.getApplication(applicationID);

				if (!application) {
					return interaction.editReply(`Application with ID ${applicationID} not found.`);
				}

				if (!application.is_open) {
					return interaction.editReply(`Application with ID ${applicationID} is not open.`);
				}

				if (!application.discord_id) {
					return interaction.editReply(
						`Application with ID ${applicationID} does not have a linked user.`,
					);
				}

				try {
					const targetUser = await interaction.client.users.fetch(application.discord_id);
					const applicationChannel = await getApplicationChannel(
						interaction.guild.channels,
						targetUser,
					);

					if (!interaction.channel) {
						return interaction.editReply(ERROR_MESSAGES.ONLY_GUILD);
					}

					if (!applicationChannel) {
						return interaction.editReply(
							`Application channel for ${targetUser.username} not found.`,
						);
					}

					if (!applicationChannel.isTextBased()) {
						return interaction.editReply(
							`Application channel for ${application.discord_id} is not a text channel.`,
						);
					}

					const applicationObject = await ApplicationModelController.getApplication(applicationID);

					if (!applicationObject) {
						return interaction.editReply(`Application with ID ${applicationID} not found.`);
					}

					await applicationChannel.send(
						getAcceptMessage(application.discord_id, interaction.client),
					);

					await ApplicationModelController.closeApplication(applicationID);

					try {
						await sendTrialInfo(targetUser, interaction, interaction.guild);
					} catch {
						interaction.channel.send(
							'Failed to send welcome message, please do so manually by using the `/trialinfo` command. Proceeding...',
						);
					}

					try {
						await MemberModelController.addMember(targetUser.id, true, [
							getIgnsFromApplication(application.content),
						]);
					} catch {
						interaction.channel.send(
							'Failed to add member to the database, please do so manually using the `/member add` command. Proceeding...',
						);
					}

					try {
						const targetMember = await interaction.guild.members.fetch(targetUser.id);
						await setTrialMemberRoles(targetMember, interaction.guild);
					} catch {
						interaction.channel.send(
							`Failed to award roles to ${targetUser.username}. Proceeding...`,
						);
					}

					return interaction.editReply(`Successfully accepted application ID ${applicationID}.`);
				} catch (e) {
					await LOGGER.error(e, `Failed to accept application ID ${applicationID}.`);
				}

				return;
			}

			if (subcommand === 'deny') {
				const applicationID = args.getInteger('application_id', true);
				const application = await ApplicationModelController.getApplication(applicationID);
				const messageID = args.getString('message_id', false);

				if (!interaction.channel) {
					return interaction.editReply(ERROR_MESSAGES.ONLY_GUILD);
				}

				if (!application) {
					return interaction.editReply(`Application with ID ${applicationID} not found.`);
				}

				if (!application.discord_id) {
					return interaction.editReply(
						`Application with ID ${applicationID} does not have a linked user.`,
					);
				}

				try {
					const targetUser = await interaction.client.users.fetch(application.discord_id);

					try {
						await notifyUserApplicationDenied(targetUser);
					} catch {
						interaction.channel.send('Failed to notify user, please do so manually. Proceeding...');
					}

					if (messageID) {
						try {
							const applicationChannel = await getTextChannelFromID(
								interaction.guild,
								'application',
							);
							const message = await applicationChannel.messages.fetch(messageID);
							await message.delete();
						} catch {
							interaction.channel.send(
								'Failed to delete application message, please do so manually. Proceeding...',
							);
						}
					}

					await ApplicationModelController.closeApplication(applicationID);
					return interaction.editReply(`Successfully denied application ID ${applicationID}.`);
				} catch (e) {
					await LOGGER.error(e, `Failed to deny application ID ${applicationID}.`);
				}
			}

			throw new Error(`Invalid argument for \`/application\`: ${subcommand}`);
		} catch (e) {
			await LOGGER.error(e, 'Failed to execute application command.');
		}

		return interaction.editReply('Failed to execute application command.');
	},
});

async function updateApplicationLink(
	applicationID: number,
	oldApplication: ApplicationInDatabase,
	targetUser: User,
): Promise<ApplicationInDatabase | null> {
	oldApplication.content.discordName = targetUser.globalName ?? targetUser.username;

	try {
		const updatedApplication = await ApplicationModelController.updateApplicationDiscordID(
			applicationID,
			targetUser.id,
		);

		return updatedApplication;
	} catch (e) {
		await LOGGER.error(
			e,
			`Failed to update application ID ${applicationID} with member ${targetUser.username}.`,
		);

		return null;
	}
}

function getWelcomeMessage(user: User) {
	return `Welcome to your application channel ${userMention(
		user.id,
	)}! You can use this channel to communicate with the members about your application and share more images and information. Don't hesistate to ask questions! There is a vote active on our application where every member can vote on your application.`;
}

function getAcceptMessage(userID: Snowflake, client: Client) {
	const { froghypers } = getEmojis(client);

	return `We are happy to inform you that your application has been accepted, ${userMention(
		userID,
	)}! Welcome to the community ${froghypers}`;
}

async function getApplicationChannel(channelManager: GuildChannelManager, user: User) {
	await channelManager.fetch();
	const channel = await channelManager.cache.find((c) => c.name === `${user.username}-application`);
	return channel;
}

async function notifyUserApplicationDenied(user: User) {
	await user.send(
		'We are sorry to inform you that your application to KiwiTech has been denied. Thank you again for your interest in our community! Of course you are welcome to stay in our server to chat with members and ask anything that interests you. We wish you the best of luck in your future endeavours!',
	);
}

async function sendTrialInfo(
	targetUser: User,
	interaction: ExtendedInteraction,
	interactionGuild: Guild,
) {
	const { kiwi } = getEmojis(interaction.client);

	const trialEmbed = new KoalaEmbedBuilder(interaction.user, {
		title: `${kiwi}  Welcome to ${interactionGuild.name} ${targetUser.username}!  ${kiwi}`,
		thumbnail: {
			url: targetUser.displayAvatarURL(),
		},
		fields: getTrialWelcomeMessage(interaction.client),
	});

	const memberGeneralChannel = await getTextChannelFromID(interactionGuild, 'memberGeneral');

	const message = await memberGeneralChannel.send({
		content: userMention(targetUser.id),
		embeds: [trialEmbed],
	});

	await message.edit({ content: '\u200b' });
}

function getIgnsFromApplication(application: ApplicationObject) {
	return application.ign.trim();
}

export async function setTrialMemberRoles(member: GuildMember, guild: Guild) {
	const { trialMember, members, kiwiInc } = config.roles;

	await guild.roles.fetch();

	const trialMemberRole = guild.roles.cache.get(trialMember);
	const membersRole = guild.roles.cache.get(members);
	const kiwiIncRole = guild.roles.cache.get(kiwiInc);

	if (!trialMemberRole || !membersRole || !kiwiIncRole) {
		return console.error('Failed to find roles for trial member.');
	}

	await member.roles.set([trialMemberRole, membersRole, kiwiIncRole]);
}
