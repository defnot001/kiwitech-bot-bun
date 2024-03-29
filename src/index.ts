import { GatewayIntentBits, Partials } from 'discord.js';
import { Client } from 'pg';
import { ExtendedClient } from './util/handler/classes/ExtendedClient';
import { LOGGER } from './util/logger';

export const client = new ExtendedClient({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildModeration,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildEmojisAndStickers,
	],
	partials: [Partials.GuildMember],
});

await client.start({
	botToken: process.env.DISCORD_BOT_TOKEN,
	guildID: process.env.DISCORD_GUILD_ID,
	globalCommands: false,
	registerCommands: true,
});

export const pgClient = await new Client({
	connectionString: process.env.DATABASE_URL,
});

pgClient
	.connect()
	.then(() => LOGGER.info('Connected to the database.'))
	.catch(async (e) => await LOGGER.error(e, 'Failed to connect to the database'));

process.on('SIGINT', () => {
	pgClient.connect();
	client.destroy();
	process.exit();
});
