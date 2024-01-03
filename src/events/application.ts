import { config } from '../config';
import { Event } from '../handler/classes/Event';
import {
  ApplicationBody,
  getGuildMemberFromUsername,
  parseApplication,
  postApplicationToChannel,
} from '../util/application';
import { storeApplication } from '../util/prisma';

export default new Event('ready', async (client) => {
  const guild = client.guilds.cache.get(config.bot.guildID);

  if (!guild) {
    throw new Error('Guild for application handling not found.');
  }

  Bun.serve({
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname === '/form-submission') {
        const json = (await req.json()) as ApplicationBody;

        if (!json.secret || json.secret !== process.env.APPLICATION_SECRET) {
          return new Response('Permission denied', {
            status: 403,
            statusText: 'FORBIDDEN',
          });
        }

        const applicationObject = parseApplication(json);

        if (!applicationObject) {
          return new Response('Invalid application', {
            status: 400,
            statusText: 'BAD REQUEST',
          });
        }

        const member = await getGuildMemberFromUsername(applicationObject.discordName, guild);
        const { id } = await storeApplication(applicationObject, true, member?.id);
        await postApplicationToChannel(applicationObject, guild, id, true, member);

        return new Response('Application recieved', {
          status: 200,
          statusText: 'OK',
        });
      }

      return new Response('Permission denied', {
        status: 403,
        statusText: 'FORBIDDEN',
      });
    },
  });

  console.log('Listening for applications on port 3000.');
});
