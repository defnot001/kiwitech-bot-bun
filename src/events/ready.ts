import { ActivityType, TextChannel } from 'discord.js';
import { config } from '../config';
import { Event } from '../util/handler/classes/Event';
import { LOGGER } from '../util/logger';
import { display } from '../util/format';
// import { client } from '../index';
// import { config } from '../config';

export const ready = new Event('ready', async (c) => {
	c.user.setActivity('Commands', { type: ActivityType.Listening });
	LOGGER.info(`Bot is ready! Logged in as ${display(c.user)}.`);

	const errorLogChannel = await c.channels.fetch(config.channels.botLog);

	if (
		!errorLogChannel ||
		!errorLogChannel.isTextBased() ||
		!(errorLogChannel instanceof TextChannel)
	) {
		throw new Error('Error log channel not found.');
	}

	LOGGER.setLogChannel(errorLogChannel);
	LOGGER.info(
		`Set error log channel to ${display(errorLogChannel)} in ${display(errorLogChannel.guild)}.`,
	);

	// await client.removeCommands(config.bot.guildID);
});
