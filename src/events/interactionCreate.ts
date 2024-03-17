import type { CommandInteractionOptionResolver, TextBasedChannel } from 'discord.js';
import { Event } from '../util/handler/classes/Event';
import { client } from '..';
import getAndLogErrorMessage from '../util/errors';
import { ExtendedInteraction } from '../handler/types';

export default new Event('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  const getChannelName = (channel: TextBasedChannel | null): string | void => {
    if (channel && 'name' in channel) {
      return channel.name;
    }
  };

  const channelNameAddon: string = `in #${getChannelName(interaction.channel)}` || '';

  console.log(`${interaction.user.username} ${channelNameAddon} triggered an interaction.`);

  if (!command) {
    return interaction.reply({
      content: `This interaction does not exist!`,
      ephemeral: true,
    });
  }

  try {
    return command.execute({
      args: interaction.options as CommandInteractionOptionResolver,
      client,
      interaction: interaction as ExtendedInteraction,
    });
  } catch (err) {
    console.error(getAndLogErrorMessage(err));
    return interaction.reply({
      content: `There was an error trying to execute the interaction: ${interaction.commandName}!`,
      ephemeral: true,
    });
  }
});
