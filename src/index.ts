import { GatewayIntentBits, Partials } from 'discord.js';
import { ExtendedClient } from './handler/classes/ExtendedClient';
import { projectPaths } from './config';

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

client.start({
  botToken: process.env.DISCORD_BOT_TOKEN,
  guildID: process.env.DISCORD_GUILD_ID,
  commandsPath: projectPaths.commands,
  eventsPath: projectPaths.events,
  globalCommands: false,
  registerCommands: false,
});
