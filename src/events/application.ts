import { config } from '../config';
import ApplicationModelController from '../database/model/applicationModelController';
import {
	type ApplicationBody,
	getGuildMemberFromUsername,
	notifyUserApplicationRecieved,
	parseApplication,
	postApplicationToChannel,
} from '../util/application';
import { Event } from '../util/handler/classes/Event';
import { LOGGER } from '../util/logger';

export const application = new Event('ready', async (client) => {
	const guild = client.guilds.cache.get(config.bot.guildID);

	if (!guild) {
		throw new Error('Guild for application handling not found.');
	}

	Bun.serve({
		async fetch(req: Request): Promise<Response> {
			const url = new URL(req.url);

			if (url.pathname === '/form-submission') {
				try {
					const json = (await req.json()) as ApplicationBody;

					if (!json.secret || json.secret !== process.env.APPLICATION_SECRET) {
						return new Response('Permission denied', {
							status: 403,
							statusText: 'FORBIDDEN',
						});
					}

					LOGGER.info(`Application recieved at ${new Date().toLocaleString()}.`);

					const applicationObject = parseApplication(json);

					if (!applicationObject) {
						return new Response('Invalid application', {
							status: 400,
							statusText: 'BAD REQUEST',
						});
					}

					const member = await getGuildMemberFromUsername(applicationObject.discordName, guild);
					const { id } = await ApplicationModelController.addApplication(
						applicationObject,
						true,
						member?.id ?? null,
					);

					if (member) {
						await notifyUserApplicationRecieved(member.user);
					}

					await postApplicationToChannel(applicationObject, guild, id, true, member);

					return new Response('Application recieved', {
						status: 200,
						statusText: 'OK',
					});
				} catch (e) {
					await LOGGER.error(e, 'Failed to handle application submission.');
					return new Response('Internal server error', {
						status: 500,
						statusText: 'INTERNAL SERVER ERROR',
					});
				}
			}

			return new Response('Permission denied', {
				status: 403,
				statusText: 'FORBIDDEN',
			});
		},
		port: 32001,
	});

	LOGGER.info('Listening for applications on port 32001.');
});
