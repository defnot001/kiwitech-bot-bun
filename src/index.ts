import { GatewayIntentBits, Partials } from 'discord.js';
import { ExtendedClient } from './util/handler/classes/ExtendedClient';
import { projectPaths } from './config';
import { Client } from 'pg';

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
  commandsPath: projectPaths.commands,
  eventsPath: projectPaths.events,
  globalCommands: false,
  registerCommands: true,
});

export const pgClient = await new Client({
  connectionString: process.env.DATABASE_URL,
});

pgClient
  .connect()
  .then(() => console.log('Connected to the database.'))
  .catch(console.error);

process.on('SIGINT', () => {
  pgClient.connect();
  client.destroy();
  process.exit();
});
