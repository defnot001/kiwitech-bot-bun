import { Snowflake } from 'discord.js';
import { pgClient } from '../..';

type MCMember = {
  discord_id: Snowflake;
  trial_member: boolean;
  minecraft_uuids: string[];
  member_since: Date;
  updated_at: Date;
};

export default abstract class MemberModelController {
  static async getMember(discordID: Snowflake) {
    const query = await pgClient.query('SELECT * FROM members WHERE discord_id = $1', [discordID]);

    return query.rows[0] as MCMember;
  }

  static async getAllMembers() {
    const query = await pgClient.query('SELECT * FROM members');

    return query.rows as MCMember[];
  }

  static async addMember(
    discordID: Snowflake,
    trialMember: boolean,
    minecraftUUIDs: string[],
    memberSince?: Date,
  ) {
    const query = await pgClient.query(
      'INSERT INTO members (discord_id, trial_member, minecraft_uuids, member_since) VALUES ($1, $2, $3, $4) RETURNING *',
      [discordID, trialMember, minecraftUUIDs, memberSince ?? new Date()],
    );

    return query.rows[0] as MCMember;
  }

  static async updateMember(
    discordID: Snowflake,
    updates: {
      trialMember?: boolean;
      minecraftUUIDs?: string[];
      memberSince?: Date;
    },
  ) {
    const currentMember = await this.getMember(discordID);

    const query = await pgClient.query(
      'UPDATE members SET trial_member = $1, minecraft_uuids = $2, member_since = $3, updated_at = $4 WHERE discord_id = $5 RETURNING *',
      [
        updates.trialMember ?? currentMember.trial_member,
        updates.minecraftUUIDs ?? currentMember.minecraft_uuids,
        updates.memberSince ?? currentMember.member_since,
        new Date(),
        discordID,
      ],
    );

    return query.rows[0] as MCMember;
  }

  static async removeMember(discordID: Snowflake) {
    const query = await pgClient.query('DELETE FROM members WHERE discord_id = $1 RETURNING *', [
      discordID,
    ]);

    return query.rows[0] as MCMember;
  }
}
