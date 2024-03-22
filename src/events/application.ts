import {
	type Client,
	EmbedBuilder,
	type Guild,
	type GuildMember,
	type Message,
	type User,
	escapeMarkdown,
	inlineCode,
	userMention,
} from 'discord.js';
import { client } from '..';
import { reactYesNo } from '../commands/application';
import { config } from '../config';
import ApplicationModelController, {
	type ApplicationInDatabase,
} from '../database/model/applicationModelController';
import { displayFormatted } from '../util/format';
import { DiscordEvent } from '../util/handler/classes/Event';
import { getTextChannelFromConfig } from '../util/helpers';
import { LOGGER } from '../util/logger';

export const application = new DiscordEvent('ready', async (client) => {
	const guild = client.guilds.cache.get(config.bot.guildID);

	if (!guild) {
		throw new Error('Guild for application handling not found.');
	}

	// biome-ignore lint/correctness/noUndeclaredVariables: we need to use bun for this
	Bun.serve({
		async fetch(req: Request): Promise<Response> {
			await LOGGER.info(`Received request from ${req.url} at ${new Date().toLocaleString()}.`);
			return await handleBunServer(req, client);
		},
		port: 32001,
	});

	LOGGER.info('Listening for applications on port 32001.');
});

async function handleBunServer(req: Request, client: Client): Promise<Response> {
	if (!req.url) {
		return new Response('Not found', {
			status: 404,
			statusText: 'NOT FOUND',
		});
	}

	const url = new URL(req.url);

	if (url.pathname !== '/form-submission') {
		return new Response('Not found', {
			status: 404,
			statusText: 'NOT FOUND',
		});
	}

	return await handleApplication(req, client);
}

async function handleApplication(req: Request, client: Client): Promise<Response> {
	const json = await req.json().catch(async (e) => {
		await LOGGER.error(e, 'Failed to parse application submission');
		return null;
	});

	if (!json) {
		return new Response('Invalid application', {
			status: 400,
			statusText: 'BAD REQUEST',
		});
	}

	if (!isAuthenticatedApplicationRequest(json)) {
		return new Response('Permission denied', {
			status: 403,
			statusText: 'FORBIDDEN',
		});
	}

	const authenticatedApplicationRequest = json as AuthenticatedApplicationRequest;
	LOGGER.info(`Application recieved at ${new Date().toLocaleString()}.`);

	if (!isApplication(authenticatedApplicationRequest)) {
		await LOGGER.error(new Error('Received wrong formatted application'));
		return new Response('Invalid application', {
			status: 400,
			statusText: 'BAD REQUEST',
		});
	}

	const applicationObject = createApplicationObject(json as ApplicationRequestBodyJSON);
	const guild = client.guilds.cache.get(config.bot.guildID);

	if (!guild) {
		await LOGGER.error('Guild for application handling not found.');
		return new Response('Internal server error', {
			status: 500,
			statusText: 'INTERNAL SERVER ERROR',
		});
	}

	const applicationMember = await getGuildMemberFromUsername(
		applicationObject.discordName.trim(),
		guild,
	);

	const addedApplication = await ApplicationModelController.addApplication({
		applicationObject,
		discordID: applicationMember?.id ?? null,
		isOpen: true,
	}).catch(async (e) => {
		await LOGGER.error(e, 'Failed to add application to database');
		return null;
	});

	if (!addedApplication) {
		return new Response('Internal server error', {
			status: 500,
			statusText: 'INTERNAL SERVER ERROR',
		});
	}

	if (!applicationMember) {
		await notifyAdminsApplicationMissingMember({
			applicationID: addedApplication.id,
			discordName: applicationObject.discordName,
			client,
			guild,
		});
	}

	if (applicationMember) {
		const dmResult = await notifyUserApplicationRecieved(applicationMember.user);

		if (dmResult === false) {
			await notifyAdminsUserDMError({
				applicationMember,
				applicationID: addedApplication.id,
				client,
				guild,
			});
		}
	}

	await postApplicationToChannel({
		application: addedApplication,
		guild,
		client,
		applicationMember,
		pingMembers: true,
	});

	return new Response('Application recieved', {
		status: 200,
		statusText: 'OK',
	});
}
function isAuthenticatedApplicationRequest(json: unknown): boolean {
	if (
		json === undefined ||
		json === null ||
		typeof json !== 'object' ||
		!('secret' in json) ||
		json.secret === undefined ||
		json.secret === null ||
		typeof json.secret !== 'string'
	) {
		return false;
	}

	return json.secret === process.env.APPLICATION_SECRET;
}

function isApplication(
	authenticatedJson: AuthenticatedApplicationRequest,
): authenticatedJson is ApplicationRequestBodyJSON {
	const json = authenticatedJson as ApplicationRequestBodyJSON;

	return applicationRequestBodyFields.every((field) => field in json);
}

function createApplicationObject(json: ApplicationRequestBodyJSON): ApplicationObject {
	return {
		timestamp: new Date(),
		discordName: json['What is your discord username? (Eg: @tmcplayer)'],
		ign: json['What is your in game name?'],
		pronouns: json['What pronouns do you use?'],
		age: json['How old are you?'],
		timezone: json['What is your timezone?'],
		languages: json['What languages do you speak?'],
		minecraftExperienceTime: json['How long have you been playing Minecraft?'],
		otherExperience:
			json['What is your experience on other technical minecraft servers? (please specify)'],
		fields: json['What fields of TMC are you specialised in? '],
		informationSource: json['Where did you hear about KiwiTech?'],
		reason: json['Why do you want to apply on KiwiTech?'],
		timeAvailable: json['How much time can you dedicate to KiwiTech per week? (rough estimate)'],
		msptAndTps: json['What do the terms MSPT and TPS stand for and why are they important?'],
		mobSpawning: json['How does mob spawning work in minecraft?'],
		updateSuppression: json['What is update suppression and how does it work?'],
		zeroTick: json["Explain zero ticking mechanics (it's not about force growth):"],
		pastBuilds: json['Link images of past builds / farms YOU’ve done:'],
		suggestions: json['Anything else you want to tell us? How can we improve our application?'],
	};
}

async function getGuildMemberFromUsername(
	username: string,
	guild: Guild,
): Promise<GuildMember | null> {
	if (!username.length) {
		await LOGGER.warn('Failed to fetch member from application: empty username');
		return null;
	}

	LOGGER.debug(`Fetching member from application: ${username}`);

	const memberCollection = await guild.members
		.fetch({
			query: username.replace('@', ''),
			limit: 1,
		})
		.catch(async () => {
			await LOGGER.warn(`Failed to fetch member from application: ${username}`);
			return null;
		});

	if (!memberCollection) {
		return null;
	}

	const member = memberCollection.first();

	if (!member) {
		await LOGGER.warn(`Failed to fetch member from application: ${username}`);
		return null;
	}

	return member;
}

async function postApplicationToChannel(options: {
	application: ApplicationInDatabase;
	guild: Guild;
	client: Client;
	pingMembers: boolean;
	applicationMember?: GuildMember | null;
}) {
	const { application, guild, client, pingMembers, applicationMember } = options;

	const embeds = buildApplicationEmbeds({
		applicationObject: application.content,
		applicationID: application.id,
		user: applicationMember?.user ?? null,
	});

	const applicationChannel = await getTextChannelFromConfig(guild, 'application');

	if (!applicationChannel) {
		return;
	}

	let message: Message | null = null;

	try {
		if (pingMembers) {
			message = await applicationChannel.send({
				embeds: embeds,
				content: `<@&${config.roles.pingPong}>`,
			});
		} else {
			message = await applicationChannel.send({ embeds });
		}
	} catch (e) {
		await LOGGER.error(e, 'Failed to post application to channel');
		return;
	}

	if (message) {
		await reactYesNo({ client, message });
	}
}

export function buildApplicationEmbeds(options: {
	applicationObject: ApplicationObject;
	applicationID: number;
	user: User | null;
}) {
	const { applicationObject, applicationID, user } = options;

	const title = user
		? `${escapeMarkdown(user.globalName ?? user.username)} Application`
		: `${applicationObject.discordName} Application`;

	const discordName = user ? user.globalName ?? user.username : applicationObject.discordName;

	const embedOne = new EmbedBuilder({
		title,
		color: config.embedColors.default,
		fields: [
			{ name: 'Discord Name', value: discordName, inline: true },
			{ name: 'IGN', value: applicationObject.ign, inline: true },
			{ name: 'Pronouns', value: applicationObject.pronouns, inline: true },
			{ name: 'Age', value: applicationObject.age, inline: true },
			{ name: 'Timezone', value: applicationObject.timezone, inline: true },
			{ name: 'Languages', value: applicationObject.languages, inline: true },
			{
				name: 'How long have you been playing Minecraft?',
				value: applicationObject.minecraftExperienceTime,
			},
			{
				name: 'What is your experience on other technical minecraft servers?',
				value: applicationObject.otherExperience,
			},
			{
				name: 'What fields of TMC are you specialised in?',
				value: applicationObject.fields.join(', '),
			},
			{
				name: 'Where did you hear about KiwiTech?',
				value: applicationObject.informationSource,
			},
			{
				name: 'Why do you want to apply to KiwiTech?',
				value: applicationObject.reason,
			},
			{
				name: 'How much time can you dedicate to KiwiTech per week?',
				value: applicationObject.timeAvailable,
			},
		],
		footer: {
			text: `1/3 General Information | ID: ${applicationID}`,
		},
		timestamp: applicationObject.timestamp,
	});

	const embedTwo = new EmbedBuilder({
		color: config.embedColors.default,
		fields: [
			{ name: 'MSPT & TPS', value: applicationObject.msptAndTps },
			{
				name: 'Mob Spawning',
				value: applicationObject.mobSpawning,
			},
			{
				name: 'Update Suppression',
				value: applicationObject.updateSuppression,
			},
			{
				name: 'Zero Ticking',
				value: applicationObject.zeroTick,
			},
		],
		footer: {
			text: `2/3 Technical Knowledge | ID: ${applicationID}`,
		},
		timestamp: applicationObject.timestamp,
	});

	const embedThree = new EmbedBuilder({
		color: config.embedColors.default,
		fields: [
			{ name: 'Images', value: applicationObject.pastBuilds },
			{
				name: 'Suggestions',
				value: applicationObject.suggestions,
			},
		],
		footer: {
			text: `3/3 Images & Suggestions | ID: ${applicationID}`,
		},
		timestamp: applicationObject.timestamp,
	});

	if (user) {
		embedOne.setThumbnail(user.displayAvatarURL());
	}

	return [embedOne, embedTwo, embedThree];
}

export async function notifyUserApplicationRecieved(user: User): Promise<boolean> {
	try {
		await user.send(
			'Thank you for applying to KiwiTech! Your application has been received and will be reviewed shortly. If you have any questions, please contact an admin.',
		);
		return true;
	} catch (e) {
		await LOGGER.error(e, "Error sending application recieved message to users DM's");
		return false;
	}
}

async function notifyAdminsApplicationMissingMember(options: {
	discordName: string;
	applicationID: number;
	client: Client;
	guild: Guild;
}) {
	const errorMessage = `Could not find member ${inlineCode(
		options.discordName,
	)} for application ID ${inlineCode(
		options.applicationID.toString(10),
	)} in the guild. Please link the application to the member manually using the \`/application link\` command.`;

	const memberErrorEmbed = new EmbedBuilder({
		description: errorMessage,
		color: config.embedColors.red,
		footer: {
			text: 'Application Error Log',
		},
		timestamp: Date.now(),
	});

	if (client.user) {
		memberErrorEmbed.setAuthor({
			name: client.user.username,
			iconURL: client.user.displayAvatarURL(),
		});
	}

	const logChannel = await getTextChannelFromConfig(options.guild, 'botLog');

	if (logChannel) {
		await logChannel
			.send({
				embeds: [memberErrorEmbed],
				content: `<@&${config.roles.admins}>`,
			})
			.catch(async (e) => {
				await LOGGER.error(
					e,
					'Error notifying admins that a member from an application was not found',
				);
			});
	}
}

async function notifyAdminsUserDMError(options: {
	applicationMember: GuildMember;
	applicationID: number;
	client: Client;
	guild: Guild;
}) {
	const errorMessage = `Could not notify user ${displayFormatted(
		options.applicationMember,
	)} in DMs that their application has been received. Please contact them manually. Here is their mention for reference: ${userMention(
		options.applicationMember.id,
	)}.`;

	const memberErrorEmbed = new EmbedBuilder({
		description: errorMessage,
		color: config.embedColors.red,
		footer: {
			text: 'Application Error Log',
		},
		timestamp: Date.now(),
	});

	if (options.client.user) {
		memberErrorEmbed.setAuthor({
			name: options.client.user.username,
			iconURL: options.client.user.displayAvatarURL(),
		});
	}

	const logChannel = await getTextChannelFromConfig(options.guild, 'botLog');

	if (logChannel) {
		await logChannel
			.send({
				embeds: [memberErrorEmbed],
				content: `<@&${config.roles.admins}>`,
			})
			.catch(async (e) => {
				await LOGGER.error(
					e,
					'Error notifying admins that there was an error notifying a user that their application was received',
				);
			});
	}
}

type AuthenticatedApplicationRequest = {
	secret: string;
};

type ApplicationRequestBodyJSON = {
	'What is your discord username? (Eg: @tmcplayer)': string;
	'What is your in game name?': string;
	'What pronouns do you use?': string;
	'How old are you?': string;
	'What is your timezone?': string;
	'What languages do you speak?': string;
	'How long have you been playing Minecraft?': string;
	'What is your experience on other technical minecraft servers? (please specify)': string;
	'What fields of TMC are you specialised in? ': string[];
	'Where did you hear about KiwiTech?': string;
	'Why do you want to apply on KiwiTech?': string;
	'How much time can you dedicate to KiwiTech per week? (rough estimate)': string;
	'What do the terms MSPT and TPS stand for and why are they important?': string;
	'How does mob spawning work in minecraft?': string;
	'What is update suppression and how does it work?': string;
	"Explain zero ticking mechanics (it's not about force growth):": string;
	'Link images of past builds / farms YOU’ve done:': string;
	'Anything else you want to tell us? How can we improve our application?': string;
	secret: string;
};

const applicationRequestBodyFields = [
	'What is your discord username? (Eg: @tmcplayer)',
	'What is your in game name?',
	'What pronouns do you use?',
	'How old are you?',
	'What is your timezone?',
	'What languages do you speak?',
	'How long have you been playing Minecraft?',
	'What is your experience on other technical minecraft servers? (please specify)',
	'What fields of TMC are you specialised in? ',
	'Where did you hear about KiwiTech?',
	'Why do you want to apply on KiwiTech?',
	'How much time can you dedicate to KiwiTech per week? (rough estimate)',
	'What do the terms MSPT and TPS stand for and why are they important?',
	'How does mob spawning work in minecraft?',
	'What is update suppression and how does it work?',
	"Explain zero ticking mechanics (it's not about force growth):",
	'Link images of past builds / farms YOU’ve done:',
	'Anything else you want to tell us? How can we improve our application?',
	'secret',
] as const;

export type ApplicationObject = {
	timestamp: Date;
	discordName: string;
	ign: string;
	pronouns: string;
	age: string;
	timezone: string;
	languages: string;
	minecraftExperienceTime: string;
	otherExperience: string;
	fields: string[];
	informationSource: string;
	reason: string;
	timeAvailable: string;
	msptAndTps: string;
	mobSpawning: string;
	updateSuppression: string;
	zeroTick: string;
	pastBuilds: string;
	suggestions: string;
};
