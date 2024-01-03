import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  GuildChannelManager,
  Snowflake,
  User,
  time,
  userMention,
} from 'discord.js';
import { Command } from '../handler/classes/Command';
import {
  closeApplication,
  deleteApplication,
  getApplicationFromID,
  getLatestApplicationFromMember,
  getLatestApplications,
  getLatestOpenApplications,
  updateApplication,
} from '../util/prisma';
import { ERROR_MESSAGES } from '../util/constants';
import { getTextChannelFromID, handleInteractionError } from '../util/loggers';
import { getApplicationEmbeds, notifyUserApplicationRecieved } from '../util/application';
import { getEmojis } from '../util/components';
import { config } from '../config';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { getTrialWelcomeMessage } from '../assets/welcomeMessage';

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
      ],
    },
  ],
  execute: async ({ interaction, args }) => {
    await interaction.deferReply();

    const subcommand = args.getSubcommand() as ApplicationSubcommand;

    if (!interaction.guild) {
      return interaction.editReply(ERROR_MESSAGES.ONLY_GUILD);
    }

    if (subcommand === 'link') {
      const targetUser = args.getUser('member');

      if (!targetUser) {
        return interaction.editReply(`Cannot find user ${targetUser}.`);
      }

      if (!interaction.guild) {
        return interaction.editReply(ERROR_MESSAGES.ONLY_GUILD);
      }

      const applicationID = args.getInteger('application_id', true);
      const messageID = args.getString('message_id', true);

      const application = await getApplicationFromID(applicationID);

      if (!application) {
        return interaction.editReply(`Application with ID ${applicationID} not found.`);
      }

      try {
        application.content.discordName = targetUser.globalName ?? targetUser.username;
        const updatedApplication = await updateApplication(
          applicationID,
          targetUser,
          application.content,
        );

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
      } catch (err) {
        handleInteractionError({
          interaction,
          err,
          message: `Failed to update application ID ${applicationID} with member ${targetUser.username}.`,
        });
      }
    }

    if (subcommand === 'display_by_id') {
      const applicationID = args.getInteger('application_id', true);
      const application = await getApplicationFromID(applicationID);

      if (!application) {
        return interaction.editReply(`Application with ID ${applicationID} not found.`);
      }

      const user = application.discordID
        ? await interaction.client.users.fetch(application.discordID)
        : undefined;

      const embeds = getApplicationEmbeds(application.content, application.id, user);

      await interaction.editReply({ embeds });
    }

    if (subcommand === 'display_latest') {
      const targetUser = args.getUser('member');

      if (!targetUser) {
        return interaction.editReply(`Cannot find user ${targetUser}.`);
      }

      const application = await getLatestApplicationFromMember(targetUser.id);
      const embeds = getApplicationEmbeds(application.content, application.id, targetUser);

      await interaction.editReply({ embeds });
    }

    if (subcommand === 'create_channel') {
      const applicationID = args.getInteger('application_id', true);
      const messageID = args.getString('message_id', true);

      try {
        const application = await getApplicationFromID(applicationID);

        if (!application) {
          return interaction.editReply(`Application with ID ${applicationID} not found.`);
        }

        if (!application.discordID) {
          return interaction.editReply(
            `Application with ID ${applicationID} does not have a linked user.`,
          );
        }

        const applicant = await interaction.client.users.fetch(application.discordID);
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

        await newChannel.send({ embeds: applicationMessage.embeds });
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
      } catch (err) {
        handleInteractionError({
          interaction,
          err,
          message: `Failed to create channel for application ID ${applicationID}.`,
        });
      }
    }

    if (subcommand === 'list') {
      const listType = (args.getString('type', false) ?? 'open') as 'open' | 'all';
      const amount = args.getInteger('amount') ?? 20;

      const applications =
        listType === 'open'
          ? await getLatestOpenApplications(amount)
          : await getLatestApplications(amount);

      const display = applications.map((a) => {
        return `Application ID: ${a.id}\nApplicant: ${a.content.discordName}\nTime: ${time(
          a.createdAt,
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

      try {
        await deleteApplication(applicationID);
        await interaction.editReply(`Successfully deleted application ID ${applicationID}.`);
      } catch {
        await interaction.editReply(`Failed to delete application ID ${applicationID}.`);
      }
    }

    if (subcommand === 'accept') {
      const applicationID = args.getInteger('application_id', true);
      const application = await getApplicationFromID(applicationID);

      if (!application) {
        return interaction.editReply(`Application with ID ${applicationID} not found.`);
      }

      if (!application.discordID) {
        return interaction.editReply(
          `Application with ID ${applicationID} does not have a linked user.`,
        );
      }

      try {
        const targetUser = await interaction.client.users.fetch(application.discordID);
        const applicationChannel = await getApplicationChannel(
          interaction.guild.channels,
          targetUser,
        );

        if (!applicationChannel) {
          return interaction.editReply(
            `Application channel for ${application.discordID} not found.`,
          );
        }

        if (!applicationChannel.isTextBased()) {
          return interaction.editReply(
            `Application channel for ${application.discordID} is not a text channel.`,
          );
        }

        await applicationChannel.send(getAcceptMessage(application.discordID));
        await closeApplication(applicationID);

        const { kiwi } = getEmojis(interaction.client);

        const trialEmbed = new KoalaEmbedBuilder(interaction.user, {
          title: `${kiwi}  Welcome to ${interaction.guild.name} ${targetUser.username}!  ${kiwi}`,
          thumbnail: {
            url: targetUser.displayAvatarURL(),
          },
          fields: getTrialWelcomeMessage(interaction.client),
        });

        const memberGeneralChannel = await getTextChannelFromID(interaction.guild, 'memberGeneral');

        const message = await memberGeneralChannel.send({
          content: userMention(targetUser.id),
          embeds: [trialEmbed],
        });

        await message.edit({ content: '\u200b' });
        return interaction.editReply(`Successfully accepted application ID ${applicationID}.`);
      } catch (err) {
        handleInteractionError({
          interaction,
          err,
          message: `Failed to accept application ID ${applicationID}.`,
        });
      }
    }

    if (subcommand === 'deny') {
      return interaction.editReply('Not implemented yet.');
    }

    return;
  },
});

function getWelcomeMessage(user: User) {
  return `Welcome to your application channel ${userMention(
    user.id,
  )}! You can use this channel to communicate with the members about your application and share more images and information. Don't hesistate to ask questions! There is a vote active on our application where every member can vote on your application.`;
}

function getAcceptMessage(userID: Snowflake) {
  return `We are happy to inform you that your application has been accepted, ${userMention(
    userID,
  )}! Welcome to the community! ${config.emoji.froghypers}`;
}

async function getApplicationChannel(channelManager: GuildChannelManager, user: User) {
  await channelManager.fetch();
  const channel = await channelManager.cache.get(`${user.username}-application`);
  return channel;
}
