import {
  ApplicationCommandOptionType,
  PermissionsBitField,
  escapeMarkdown,
  inlineCode,
  time,
} from 'discord.js';
import { Command } from '../handler/classes/Command';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import {
  addMember,
  getMemberFromID,
  getMemberNames,
  isMemberInDatabase,
  removeMember,
  updateMember,
} from '../util/prisma';

export default new Command({
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
      return interaction.editReply({
        content: 'This command can only be used in a server.',
      });
    }

    const subcommand = args.getSubcommand() as 'list' | 'info' | 'add' | 'update' | 'remove';

    if (subcommand === 'list') {
      const memberNames = await getMemberNames(interaction.guild.members);

      const embed = new KoalaEmbedBuilder(interaction.user, {
        title: `Member List for ${guild.name}`,
        description: memberNames.map((member) => escapeMarkdown(member.username)).join('\n'),
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
        } catch (err) {
          return interaction.editReply(`${user.username} is not a member of ${guild.name}.`);
        }

        const member = await getMemberFromID(user.id);
        const { minecraftData } = member;

        if (!minecraftData.length) {
          return interaction.editReply(
            `${user.username} does not have any data related to Minecraft.`,
          );
        }

        const usernames: Array<[string, string]> = [];

        for (const data of minecraftData) {
          usernames.push([data.username, data.uuid]);
        }

        const skinUrl = `https://crafatar.com/avatars/${usernames[0]![1]}?overlay&size=512`;

        const embed = new KoalaEmbedBuilder(interaction.user, {
          title: `Member Info ${escapeMarkdown(user.username)}`,
          thumbnail: {
            url: skinUrl,
          },
          fields: [
            { name: 'Discord ID', value: `${inlineCode(member.discordID)}` },
            {
              name: 'Minecraft Usernames',
              value: usernames
                .map(([name, uuid]) => `${escapeMarkdown(name)} (${inlineCode(uuid)})`)
                .join('\n'),
            },
            {
              name: 'Member Since',
              value: `${time(member.memberSince, 'D')}\n${time(member.memberSince, 'R')}`,
            },
            {
              name: 'Last Updated At',
              value: `${time(member.updatedAt, 'D')}\n${time(member.updatedAt, 'R')}`,
            },
            { name: 'Trial Member', value: member.trialMember ? 'Yes' : 'No' },
          ],
        });

        await interaction.editReply({
          embeds: [embed],
        });
      } catch {
        interaction.editReply({
          content: `${escapeMarkdown(user.username)} is not a member of ${guild.name}.`,
        });
      }
    }

    if (subcommand === 'add' || subcommand === 'update') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
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

        const igns = ign!.split(',').map((name) => name.trim());

        if (igns.length === 0) {
          return interaction.editReply('You must provide at least one IGN.');
        }

        const memberSinceDate = new Date(memberSince ?? new Date().toISOString());

        try {
          await addMember(user.id, igns, memberSinceDate, trial!);

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

        let igns: string[] | undefined = undefined;
        let trialMember: boolean | undefined = undefined;
        let memberSinceDate: Date | undefined = undefined;

        if (ign !== null) {
          igns = ign.split(',').map((name) => name.trim());
        }

        if (trial !== null) {
          trialMember = trial;
        }

        if (memberSince !== null) {
          memberSinceDate = new Date(memberSince);
        }

        try {
          await updateMember(user.id, igns, trialMember, memberSinceDate);

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
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply('You must be an Administrator to use this command.');
      }

      if (!(await isMemberInDatabase(interaction.user.id))) {
        return interaction.editReply(
          `${interaction.user.username} is not a member of ${guild.name}.`,
        );
      }

      const user = args.getUser('member', true);

      try {
        await removeMember(user.id);

        interaction.editReply(`Successfully removed ${user.username} from the Memberlist.`);
      } catch (err) {
        interaction.editReply(`Failed to remove ${user.username} from ${guild.name}.`);
      }
    }

    return;
  },
});
