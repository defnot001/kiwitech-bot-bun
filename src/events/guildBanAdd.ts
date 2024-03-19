import { AuditLogEvent } from 'discord.js';
import { ModerationEmbedBuilder } from '../classes/ModerationEmbedBuilder';
import { Event } from '../util/handler/classes/Event';
import { LOGGER } from '../util/logger';

export const guildBanAdd = new Event('guildBanAdd', async (guildBan) => {
	try {
		const ban = guildBan.partial ? await guildBan.fetch() : guildBan;

		LOGGER.info(`${ban.user.username} was banned from ${ban.guild}.`);

		const fetchedLogs = await ban.guild.fetchAuditLogs({
			limit: 1,
			type: AuditLogEvent.MemberBanAdd,
		});

		const banLog = fetchedLogs.entries.first();

		if (!banLog) throw new Error('Cannot find BanLog.');

		const { executor, target, action, reason } = banLog;

		if (!executor || !target || action !== AuditLogEvent.MemberBanAdd) {
			throw new Error('Cannot find executor or target from the Audit Log.');
		}

		const executingMember = await ban.guild.members.fetch(executor.id);
		const modLog = await getTextChannelFromID(ban.guild, 'modLog');

		if (target.id === ban.user.id) {
			const banEmbed = new ModerationEmbedBuilder({
				target: ban.user,
				executor: executingMember,
				action: 'ban',
				reason: reason,
			});

			modLog.send({ embeds: [banEmbed] });
		} else {
			throw new Error(
				'The IDs of the target in the AuditLog and the target from the Event did not match.',
			);
		}
	} catch (e) {
		await LOGGER.error(e, 'Failed to log the ban event.');
	}
});
