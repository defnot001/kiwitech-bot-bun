import { Snowflake } from 'discord.js';
import { ApplicationObject } from '../../util/application';
import { pgClient } from '../..';

export type ApplicationInDatabase = {
  id: number;
  discord_id: Snowflake | null;
  is_open: boolean;
  content: ApplicationObject;
  created_at: Date;
  updated_at: Date;
};

export default abstract class ApplicationModelController {
  static async getApplications(kind: 'open' | 'closed' | 'all', limit = 20) {
    let query;

    if (kind === 'open') {
      query = await pgClient.query(
        'SELECT * FROM applications WHERE is_open = true ORDER BY created_at DESC LIMIT $1',
        [limit],
      );
    } else if (kind === 'closed') {
      query = await pgClient.query(
        'SELECT * FROM applications WHERE is_open = false ORDER BY created_at DESC LIMIT $1',
        [limit],
      );
    } else {
      query = await pgClient.query('SELECT * FROM applications ORDER BY created_at DESC LIMIT $1', [
        limit,
      ]);
    }

    return query.rows as ApplicationInDatabase[];
  }

  static async getApplication(applicationID: number) {
    const query = await pgClient.query('SELECT * FROM applications WHERE id = $1', [applicationID]);

    return query.rows[0] as ApplicationInDatabase;
  }

  static async getLatestApplicationByDiscordID(discordID: Snowflake) {
    const query = await pgClient.query(
      'SELECT * FROM applications WHERE discord_id = $1 ORDER BY created_at DESC LIMIT 1',
      [discordID],
    );

    return query.rows[0] as ApplicationInDatabase;
  }

  static async addApplication(
    application: ApplicationObject,
    isOpen: boolean,
    discordID: Snowflake | null,
  ) {
    const query = await pgClient.query(
      'INSERT INTO applications (discord_id, is_open, content) VALUES ($1, $2, $3) RETURNING *',
      [discordID, isOpen, application],
    );

    return query.rows[0] as ApplicationInDatabase;
  }

  static async deleteApplication(applicationID: number) {
    const query = await pgClient.query('DELETE FROM applications WHERE id = $1 RETURNING *', [
      applicationID,
    ]);

    return query.rows[0] as ApplicationInDatabase;
  }

  static async updateApplicationDiscordID(applicationID: number, discordID: Snowflake) {
    const query = await pgClient.query(
      'UPDATE applications SET discord_id = $1 WHERE id = $2 RETURNING *',
      [discordID, applicationID],
    );

    return query.rows[0] as ApplicationInDatabase;
  }

  static async closeApplication(applicationID: number) {
    const query = await pgClient.query(
      'UPDATE applications SET is_open = false WHERE id = $1 RETURNING *',
      [applicationID],
    );

    return query.rows[0] as ApplicationInDatabase;
  }

  static async updateApplication(
    applicationID: number,
    updates: { isOpen?: boolean; content?: ApplicationObject; discordID?: Snowflake },
  ) {
    const previousApplication = await this.getApplication(applicationID);

    const query = await pgClient.query(
      'UPDATE applications SET is_open = $1, content = $2, discord_id = $3, updated_at = $4 WHERE id = $5 RETURNING *',
      [
        updates.isOpen ?? previousApplication.is_open,
        updates.content ?? previousApplication.content,
        updates.discordID ?? previousApplication.discord_id,
        new Date(),
        applicationID,
      ],
    );

    return query.rows[0] as ApplicationInDatabase;
  }
}
