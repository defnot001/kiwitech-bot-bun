import {
  ApplicationCommandOptionChoiceData,
  GuildMember,
  GuildMemberManager,
  PartialGuildMember,
  PermissionFlagsBits,
  Snowflake,
  time,
} from 'discord.js';
import { config } from '../config';

export function getServerChoices(): ApplicationCommandOptionChoiceData<string>[] {
  const choices = [];

  for (const server of Object.keys(config.mcConfig)) {
    choices.push({ name: server, value: server });
  }

  return choices;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return bytes + ' bytes';
  } else if (bytes < 1024 ** 2) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else if (bytes < 1024 ** 3) {
    return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  } else if (bytes < 1024 ** 4) {
    return (bytes / 1024 ** 3).toFixed(1) + ' GB';
  } else {
    return (bytes / 1024 ** 4).toFixed(1) + ' TB';
  }
}

export function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function getJoinedAtComponent(member: GuildMember | PartialGuildMember): string {
  return member.joinedAt
    ? `\nJoined at: ${time(member.joinedAt, 'f')} (${time(member.joinedAt, 'R')})`
    : '\u200b';
}

export async function getMembersFromID(members: Snowflake[], manager: GuildMemberManager) {
  const fetched = await manager.fetch({
    user: members,
  });

  return fetched;
}

export function isAdmin(member: GuildMember | PartialGuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

export function escapeMarkdown(text: string): string {
  const unescaped = text.replace(/\\(\*|_|`|~|\\)/g, '$1');
  return unescaped.replace(/(\*|_|`|~|\\)/g, '\\$1');
}
