import type { Snowflake, User } from 'discord.js';
import { pgClient } from '../..';
import type { ApplicationObject } from '../../events/application';

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
		let query: { rows: ApplicationInDatabase[] };

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

	static async getApplication(applicationId: number) {
		const query = await pgClient.query('SELECT * FROM applications WHERE id = $1', [applicationId]);

		return query.rows[0] as ApplicationInDatabase;
	}

	static async getLatestApplicationByDiscordID(discordId: Snowflake) {
		const query = await pgClient.query(
			'SELECT * FROM applications WHERE discord_id = $1 ORDER BY created_at DESC LIMIT 1',
			[discordId],
		);

		return query.rows[0] as ApplicationInDatabase;
	}

	static async addApplication(options: {
		applicationObject: ApplicationObject;
		isOpen: boolean;
		discordID: Snowflake | null;
	}) {
		const query = await pgClient.query(
			'INSERT INTO applications (discord_id, is_open, content) VALUES ($1, $2, $3) RETURNING *',
			[options.discordID, options.isOpen, options.applicationObject],
		);

		return query.rows[0] as ApplicationInDatabase;
	}

	static async deleteApplication(applicationId: number) {
		const query = await pgClient.query('DELETE FROM applications WHERE id = $1 RETURNING *', [
			applicationId,
		]);

		return query.rows[0] as ApplicationInDatabase;
	}

	static async linkApplication(options: {
		applicationID: number;
		newUser: User;
	}) {
		const newDiscordId = options.newUser.id;
		const newUsername = options.newUser.globalName ?? options.newUser.username;

		const query = await pgClient.query(
			`
			UPDATE applications
			SET
				discord_id = $1,
				content = jsonb_set(content::jsonb, '{discordName}', $2::jsonb),
				updated_at = NOW()
			WHERE id = $3
			RETURNING *;
			`,
			[newDiscordId, JSON.stringify(newUsername), options.applicationID],
		);

		return query.rows[0] as ApplicationInDatabase;
	}

	static async closeApplication(applicationId: number) {
		const query = await pgClient.query(
			'UPDATE applications SET is_open = false WHERE id = $1 RETURNING *',
			[applicationId],
		);

		return query.rows[0] as ApplicationInDatabase;
	}

	static async updateApplication(
		applicationId: number,
		updates: {
			isOpen?: boolean;
			content?: ApplicationObject;
			discordID?: Snowflake;
		},
	) {
		const previousApplication = await ApplicationModelController.getApplication(applicationId);

		const query = await pgClient.query(
			'UPDATE applications SET is_open = $1, content = $2, discord_id = $3, updated_at = $4 WHERE id = $5 RETURNING *',
			[
				updates.isOpen ?? previousApplication.is_open,
				updates.content ?? previousApplication.content,
				updates.discordID ?? previousApplication.discord_id,
				new Date(),
				applicationId,
			],
		);

		return query.rows[0] as ApplicationInDatabase;
	}
}
