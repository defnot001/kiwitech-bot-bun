import {
	type ApplicationCommandOptionChoiceData,
	type Guild,
	type GuildMember,
	type GuildMemberManager,
	type PartialGuildMember,
	PermissionFlagsBits,
	type Snowflake,
	TextChannel,
	time,
} from 'discord.js';
import { type ChannelConfig, config } from '../config';

export function getServerChoices(): ApplicationCommandOptionChoiceData<string>[] {
	const choices = [];

	for (const server of Object.keys(config.mcConfig)) {
		choices.push({ name: server, value: server });
	}

	return choices;
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
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

export async function getTextChannelFromID(
	guild: Guild,
	channel: keyof ChannelConfig,
): Promise<TextChannel> {
	const fetchedChannel = await guild.channels.fetch(config.channels[channel]);

	if (!fetchedChannel || !(fetchedChannel instanceof TextChannel)) {
		throw new Error('Failed to fetch text channel!');
	}

	return fetchedChannel;
}
