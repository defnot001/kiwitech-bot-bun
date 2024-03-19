import { AuditLogEvent, inlineCode, time, userMention } from 'discord.js';
import { JoinLeaveEmbedBuilder } from '../classes/JoinLeaveEmbedBuilder';
import { ModerationEmbedBuilder } from '../classes/ModerationEmbedBuilder';
import { DiscordEvent } from '../util/handler/classes/Event';

import { getJoinedAtComponent, getTextChannelFromConfig } from '../util/helpers';
import { LOGGER } from '../util/logger';

export const guildMemberRemove = new DiscordEvent('guildMemberRemove', async (member) => {
	try {
		LOGGER.info(`${member.user.username} left ${member.guild.name}`);

		const joinedAt = getJoinedAtComponent(member);
		const memberLog = await getTextChannelFromConfig(member.guild, 'memberLog');

		const userLeaveEmbed = new JoinLeaveEmbedBuilder(member, 'left', {
			description: `Username: ${userMention(member.user.id)}\nUser ID: ${inlineCode(
				member.user.id,
			)}${joinedAt}\nLeft at: ${time(new Date(), 'f')} (${time(new Date(), 'R')})`,
		});

		if (!memberLog) throw new Error('Cannot find memberLog channel.');

		memberLog.send({ embeds: [userLeaveEmbed] });

		// handle member being kicked from the guild
		const fetchedLogs = await member.guild.fetchAuditLogs({
			limit: 1,
			type: AuditLogEvent.MemberKick,
		});

		const kickLog = fetchedLogs.entries.first();

		if (!kickLog) return;

		const { executor, target, action, reason } = kickLog;

		if (!executor || !target || action !== AuditLogEvent.MemberKick) {
			throw new Error('Cannot find executor or target from the Audit Log.');
		}

		if (target.id === member.user.id) {
			LOGGER.info(`${member.user.username} was kicked from ${member.guild.name}.`);

			const executingMember = await member.guild.members.fetch(executor.id);
			const modLog = await getTextChannelFromConfig(member.guild, 'modLog');

			if (!modLog) throw new Error('Cannot find modLog channel.');

			const kickEmbed = new ModerationEmbedBuilder({
				target: member.user,
				executor: executingMember,
				action: 'kick',
				reason: reason,
			});

			modLog.send({ embeds: [kickEmbed] });
		}
	} catch (e) {
		await LOGGER.error(e, 'Failed to log the leave event');
	}
});
