import {
	type ApplicationCommandOptionChoiceData,
	type Guild,
	type GuildMember,
	type GuildMemberManager,
	type Message,
	type PartialGuildMember,
	PermissionFlagsBits,
	type Snowflake,
	TextChannel,
	type User,
	time,
} from 'discord.js';
import { type ChannelConfig, config } from '../config';
import { display } from './format';
import type { ExtendedClient } from './handler/classes/ExtendedClient';
import { LOGGER } from './logger';

export function getServerChoices(): ApplicationCommandOptionChoiceData<string>[] {
	const choices = [];

	for (const server of Object.keys(config.mcConfig)) {
		choices.push({ name: server, value: server });
	}

	return choices;
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return '0 Bytes';
	}

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

/**
 * Fetches a TextChannel from the configured channels.
 * @returns The fetched TextChannel, or null if an error occurred.
 * @sideeffect Logs the error if one occurs.
 */
export async function getTextChannelFromConfig(
	guild: Guild,
	channel: keyof ChannelConfig,
): Promise<TextChannel | null> {
	LOGGER.debug(
		`Fetching config channel #${channel} (${config.channels[channel]}) in guild ${display(guild)}`,
	);

	const fetchedChannel = await guild.channels.fetch(config.channels[channel]).catch(async (e) => {
		await LOGGER.error(
			e,
			`Error fetching config channel #${channel} (${config.channels[channel]}) in guild ${display(
				guild,
			)}`,
		);
		return null;
	});

	if (!fetchedChannel) {
		return null;
	}

	if (!(fetchedChannel instanceof TextChannel)) {
		await LOGGER.error(
			new Error(
				`Config channel #${channel} (${config.channels[channel]}) in guild ${display(
					guild,
				)} is not a text channel`,
			),
		);
		return null;
	}

	return fetchedChannel;
}

/**
 * Fetches a User.
 * @returns The fetched User, or null if an error occurred.
 * @sideeffect Logs the error if one occurs.
 */
export async function fetchUser(id: Snowflake, client: ExtendedClient): Promise<User | null> {
	try {
		LOGGER.debug(`Fetching user with ID: ${id}`);
		return await client.users.fetch(id);
	} catch (e) {
		await LOGGER.error(e, 'Error fetching user');
		return null;
	}
}

/**
 * Fetches a Message from a Channel.
 * @returns The fetched Message, or null if an error occurred.
 * @sideeffect Logs the error if one occurs.
 */
export async function fetchMessage(options: {
	channel: TextChannel;
	messageID: Snowflake;
}): Promise<Message | null> {
	const { channel, messageID } = options;

	try {
		LOGGER.debug(`Fetching message with ID: ${messageID} from channel ${display(channel)}`);
		return await channel.messages.fetch(messageID);
	} catch (e) {
		await LOGGER.error(
			e,
			`Error fetching message with ID: ${messageID} from channel ${display(channel)}`,
		);
		return null;
	}
}
