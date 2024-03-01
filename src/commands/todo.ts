import { ApplicationCommandOptionType, EmbedBuilder, inlineCode, WebhookClient } from 'discord.js';
import { Command } from '../handler/classes/Command';
import { config } from '../config';
import { getTextChannelFromID, handleInteractionError } from '../util/loggers';
import { ERROR_MESSAGES } from '../util/constants';
import TodoModelController, { Todo } from '../database/model/todoModelController';

export default new Command({
  name: 'todo',
  description: 'Add, update, or complete a todo item.',
  options: [
    {
      name: 'add',
      description: 'Add a todo item.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'type',
          description: 'Choose wether the todo is related to survival or creative gameplay.',
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: [
            { name: 'survival', value: 'survival' },
            { name: 'creative', value: 'creative' },
          ],
        },
        {
          name: 'title',
          description: 'The title of the todo item.',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: 'update',
      description: 'Update a todo item.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'title',
          description: 'The title of the todo item.',
          type: ApplicationCommandOptionType.String,
          required: true,
          autocomplete: true,
        },
        {
          name: 'newtitle',
          description: 'The new title of the todo item.',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: 'complete',
      description: 'Complete a todo item.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'title',
          description: 'The title of the todo item.',
          type: ApplicationCommandOptionType.String,
          required: true,
          autocomplete: true,
        },
      ],
    },
  ],
  execute: async ({ interaction, args }) => {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      return interaction.editReply(ERROR_MESSAGES.ONLY_GUILD);
    }

    const subcommand = args.getSubcommand() as 'add' | 'update' | 'complete';
    const type = args.getString('type') as 'survival' | 'creative';

    const title = args.getString('title');

    if (!title) {
      return interaction.editReply('Please provide a title.');
    }

    const webhook = new WebhookClient({ url: config.webhooks.todo });

    if (!webhook) {
      return interaction.editReply('Failed to connect to the webhook!');
    }

    try {
      const todoLogChannel = await getTextChannelFromID(interaction.guild, 'todoLog');

      const todoLogEmbed = new EmbedBuilder({
        title: `${interaction.guild.name} Todo Log`,
        color: config.embedColors.default,
        footer: {
          text: interaction.user.username,
          iconURL: interaction.user.displayAvatarURL(),
        },
        timestamp: new Date(),
      });

      if (subcommand === 'add') {
        await TodoModelController.addTodo(title, type, interaction.user.id);

        interaction.editReply('Successfully added todo item to the database.');

        todoLogEmbed.setDescription(
          `Created a new todo item for the ${type} list: ${inlineCode(title)}`,
        );
      } else if (subcommand === 'update') {
        const newTitle = args.getString('newtitle');

        if (!newTitle) {
          return interaction.editReply('Please provide a new title.');
        }

        await TodoModelController.updateTodoTitle(title, newTitle);

        interaction.editReply('Successfully updated todo item in the database.');

        todoLogEmbed.setDescription(
          `Updated a todo item: "${inlineCode(title)}" to "${inlineCode(newTitle)}".`,
        );
      } else {
        await TodoModelController.completeTodo(title);

        interaction.editReply('Successfully completed todo item.');

        todoLogEmbed.setDescription(`Completed a todo item: ${inlineCode(title)}.`);
      }

      const todoChannel = await getTextChannelFromID(interaction.guild, 'todo');
      const messages = await todoChannel.messages.fetch();

      if (messages.size > 0) {
        messages.forEach(async (message) => {
          await message.delete();
        });
      }

      const transformTodo = (todo: Todo[]) => {
        return todo.map((todo) => `• ${todo.title}`).join('\n');
      };

      const survivalTodo = await TodoModelController.getTodoByType('survival');
      const creativeTodo = await TodoModelController.getTodoByType('creative');

      const survivalEmbed = new EmbedBuilder({
        title: 'Survival Todo List',
        color: config.embedColors.darkpurple,
        description: transformTodo(survivalTodo),
        timestamp: new Date(),
      });

      const creativeEmbed = new EmbedBuilder({
        title: 'Creative Todo List',
        color: config.embedColors.purple,
        description: transformTodo(creativeTodo),
        timestamp: new Date(),
      });

      const guildIcon = interaction.guild.iconURL();

      if (guildIcon) {
        survivalEmbed.setThumbnail(guildIcon);
        creativeEmbed.setThumbnail(guildIcon);
      }

      await webhook.send({
        embeds: [survivalEmbed, creativeEmbed],
      });

      return todoLogChannel.send({ embeds: [todoLogEmbed] });
    } catch (err) {
      return handleInteractionError({
        interaction,
        err,
        message: `There was an error trying to execute todo ${subcommand}!`,
      });
    }
  },
});
