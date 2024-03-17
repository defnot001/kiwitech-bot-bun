import { ActivityType, TextChannel } from 'discord.js';
import { Event } from '../util/handler/classes/Event';
import { LOGGER } from '../util/logger';
import { config } from '../config';
// import { client } from '../index';
// import { config } from '../config';

export default new Event('ready', async (c) => {
  c.user.setActivity('Commands', { type: ActivityType.Listening });
  LOGGER.info(`Bot is ready! Logged in as ${c.user.username}.`);

  const errorLogChannel = await c.channels.fetch(config.channels.botLog);

  if (
    !errorLogChannel ||
    !errorLogChannel.isTextBased() ||
    !(errorLogChannel instanceof TextChannel)
  ) {
    throw new Error('Error log channel not found.');
  }

  LOGGER.setLogChannel(errorLogChannel);
  LOGGER.info(`Set error log channel to ${errorLogChannel.name} in ${errorLogChannel.guild.name}.`);

  // await client.removeCommands(config.bot.guildID);
});
