import type { Snowflake } from 'discord.js';
import { pgClient } from '../..';

type McMember = {
	discord_id: Snowflake;
	trial_member: boolean;
	minecraft_uuids: string[];
	member_since: Date;
	updated_at: Date;
};

export default abstract class MemberModelController {
	static async getMember(discordId: Snowflake) {
		const query = await pgClient.query('SELECT * FROM members WHERE discord_id = $1', [discordId]);

		return query.rows[0] as McMember;
	}

	static async getAllMembers() {
		const query = await pgClient.query('SELECT * FROM members');

		return query.rows as McMember[];
	}

	static async addMember(options: {
		discordID: Snowflake;
		trialMember: boolean;
		minecraftUUIDs: string[];
		memberSince: Date;
	}) {
		const { discordID, trialMember, minecraftUUIDs, memberSince } = options;

		const query = await pgClient.query(
			'INSERT INTO members (discord_id, trial_member, minecraft_uuids, member_since) VALUES ($1, $2, $3, $4) RETURNING *',
			[discordID, trialMember, minecraftUUIDs, memberSince],
		);

		return query.rows[0] as McMember;
	}

	static async updateMember(
		discordId: Snowflake,
		updates: {
			trialMember?: boolean | null;
			minecraftUUIDs?: string[] | null;
			memberSince?: Date | null;
		},
	) {
		const currentMember = await MemberModelController.getMember(discordId);

		const trialMember =
			updates.trialMember !== undefined && updates.trialMember === null
				? updates.trialMember
				: currentMember.trial_member;

		const minecraftUuiDs =
			updates.minecraftUUIDs !== undefined && updates.minecraftUUIDs === null
				? updates.minecraftUUIDs
				: currentMember.minecraft_uuids;

		const memberSince =
			updates.memberSince !== undefined && updates.memberSince === null
				? updates.memberSince
				: currentMember.member_since;

		const query = await pgClient.query(
			'UPDATE members SET trial_member = $1, minecraft_uuids = $2, member_since = $3, updated_at = $4 WHERE discord_id = $5 RETURNING *',
			[trialMember, minecraftUuiDs, memberSince, new Date(), discordId],
		);

		return query.rows[0] as McMember;
	}

	static async removeMember(discordId: Snowflake) {
		const query = await pgClient.query('DELETE FROM members WHERE discord_id = $1 RETURNING *', [
			discordId,
		]);

		return query.rows[0] as McMember;
	}
}
