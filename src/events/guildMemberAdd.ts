import { inlineCode, time, userMention } from 'discord.js';
import { JoinLeaveEmbedBuilder } from '../classes/JoinLeaveEmbedBuilder';
import { Event } from '../util/handler/classes/Event';
import { getJoinedAtComponent } from '../util/helpers';
import { getTextChannelFromID } from '../util/loggers';
import { LOGGER } from '../util/logger';
export default new Event('guildMemberAdd', async (member) => {
	try {
		console.log(`${member.user.username} joined ${member.guild.name}.`);

		const memberLog = await getTextChannelFromID(member.guild, 'memberLog');
		const joinedAt = getJoinedAtComponent(member);

		const accountAge = new Date().valueOf() - member.user.createdAt.valueOf();
		const embedColor = colorFromDuration(accountAge) || 3_092_790;

		const joinEmbed = new JoinLeaveEmbedBuilder(member, 'joined', {
			description: `Username: ${userMention(member.user.id)}\nUser ID: ${inlineCode(
				member.user.id,
			)}${joinedAt}\nCreated at: ${time(member.user.createdAt, 'f')} (${time(
				member.user.createdAt,
				'R',
			)})`,
		});

		joinEmbed.setColor(embedColor);

		memberLog.send({ embeds: [joinEmbed] });
	} catch (e) {
		await LOGGER.error(e, 'Failed to log the join event.');
	}
});

function colorFromDuration(duration: number): number {
	const MAX_TRUST_ACCOUNT_AGE = 1_000 * 60 * 60 * 24 * 7 * 4;
	const percent = Math.min(duration / (MAX_TRUST_ACCOUNT_AGE / 100), 100);
	let red: number;
	let green: number;
	let blue = 0;

	if (percent < 50) {
		red = 255;
		green = Math.round(5.1 * percent);
	} else {
		green = 255;
		red = Math.round(510 - 5.1 * percent);
	}

	const tintFactor = 0.3;

	red += (255 - red) * tintFactor;
	green += (255 - green) * tintFactor;
	blue += (255 - blue) * tintFactor;

	return Math.floor((red << 16) + (green << 8) + blue);
}
