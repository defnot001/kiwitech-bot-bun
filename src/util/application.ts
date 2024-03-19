import {
	type ClientUser,
	EmbedBuilder,
	type Guild,
	type GuildMember,
	type TextChannel,
	type User,
	inlineCode,
} from 'discord.js';
import { z } from 'zod';
import { client } from '..';
import { config } from '../config';
import { getEmojis } from './components';
import { escapeMarkdown, getTextChannelFromConfig } from './helpers';
import { LOGGER } from './logger';

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

const applicationBodySchema = z.object({
	'What is your discord username? (Eg: @tmcplayer)': z.string(),
	'What is your in game name?': z.string(),
	'What pronouns do you use?': z.string(),
	'How old are you?': z.string(),
	'What is your timezone?': z.string(),
	'What languages do you speak?': z.string(),
	'How long have you been playing Minecraft?': z.string(),
	'What is your experience on other technical minecraft servers? (please specify)': z.string(),
	'What fields of TMC are you specialised in? ': z.array(z.string()),
	'Where did you hear about KiwiTech?': z.string(),
	'Why do you want to apply on KiwiTech?': z.string(),
	'How much time can you dedicate to KiwiTech per week? (rough estimate)': z.string(),
	'What do the terms MSPT and TPS stand for and why are they important?': z.string(),
	'How does mob spawning work in minecraft?': z.string(),
	'What is update suppression and how does it work?': z.string(),
	"Explain zero ticking mechanics (it's not about force growth):": z.string(),
	'Link images of past builds / farms YOU’ve done:': z.string(),
	'Anything else you want to tell us? How can we improve our application?': z.string(),
	secret: z.string(),
});

export type ApplicationBody = z.infer<typeof applicationBodySchema>;

export function parseApplication(body: ApplicationBody): ApplicationObject | null {
	try {
		const parsedValues = applicationBodySchema.parse(body);

		const parsedApplication = {
			timestamp: new Date(),
			discordName: parsedValues['What is your discord username? (Eg: @tmcplayer)'],
			ign: parsedValues['What is your in game name?'],
			pronouns: parsedValues['What pronouns do you use?'],
			age: parsedValues['How old are you?'],
			timezone: parsedValues['What is your timezone?'],
			languages: parsedValues['What languages do you speak?'],
			minecraftExperienceTime: parsedValues['How long have you been playing Minecraft?'],
			otherExperience:
				parsedValues[
					'What is your experience on other technical minecraft servers? (please specify)'
				],
			fields: parsedValues['What fields of TMC are you specialised in? '],
			informationSource: parsedValues['Where did you hear about KiwiTech?'],
			reason: parsedValues['Why do you want to apply on KiwiTech?'],
			timeAvailable:
				parsedValues['How much time can you dedicate to KiwiTech per week? (rough estimate)'],
			msptAndTps:
				parsedValues['What do the terms MSPT and TPS stand for and why are they important?'],
			mobSpawning: parsedValues['How does mob spawning work in minecraft?'],
			updateSuppression: parsedValues['What is update suppression and how does it work?'],
			zeroTick: parsedValues["Explain zero ticking mechanics (it's not about force growth):"],
			pastBuilds: parsedValues['Link images of past builds / farms YOU’ve done:'],
			suggestions:
				parsedValues['Anything else you want to tell us? How can we improve our application?'],
		};

		return parsedApplication;
	} catch {
		return null;
	}
}

export async function postApplicationToChannel(
	applicationObject: ApplicationObject,
	guild: Guild,
	applicationID: number,
	pingMembers: boolean,
	member?: GuildMember,
) {
	try {
		if (!client.user) {
			throw new Error('Client user not found');
		}

		const botLogChannel = await getTextChannelFromConfig(guild, 'botLog');
		const applicationChannel = await getTextChannelFromConfig(guild, 'application');

		if (!applicationChannel) {
			throw new Error('Application channel not found');
		}

		if (!botLogChannel) {
			throw new Error('Bot log channel not found');
		}

		if (!member) {
			notifyApplicationMissingMember(applicationObject, applicationID, client.user, botLogChannel);
		}

		const applicationEmbeds = buildApplicationEmbeds({
			applicationObject,
			applicationID,
			user: member?.user ?? null,
		});

		if (!pingMembers) {
			await applicationChannel.send({ embeds: applicationEmbeds });
			return;
		}

		const message = await applicationChannel.send({
			content: `<@&${config.roles.pingPong}>`,
			embeds: applicationEmbeds,
		});

		const emojis = getEmojis(client);

		await message.react(emojis.frogYes);
		await message.react(emojis.frogNo);
	} catch (e) {
		await LOGGER.error(e, 'Error posting application to channel');
	}

	return;
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

async function notifyApplicationMissingMember(
	application: ApplicationObject,
	applicationID: number,
	clientUser: ClientUser,
	logChannel: TextChannel,
) {
	const errorMessage = `Could not find member ${inlineCode(
		application.discordName,
	)} for application ID ${inlineCode(
		applicationID.toString(10),
	)} in the guild. Please link the application to the member manually using the \`/application link\` command.`;

	const memberErrorEmbed = new EmbedBuilder({
		author: {
			name: clientUser.username,
			iconURL: clientUser.displayAvatarURL(),
		},
		description: errorMessage,
		color: config.embedColors.red,
		footer: {
			text: 'Application Error Log',
		},
		timestamp: Date.now(),
	});

	logChannel.send({
		embeds: [memberErrorEmbed],
		content: `<@&${config.roles.admins}>`,
	});
}

export async function notifyUserDMFailed() {}

export async function getGuildMemberFromUsername(
	username: string,
	guild: Guild,
): Promise<GuildMember | undefined> {
	const replaced = username.replace('@', '');

	try {
		const memberCollection = await guild.members.fetch({
			query: replaced,
			limit: 1,
		});

		const member = memberCollection.first();

		if (!member) {
			return undefined;
		}

		return member;
	} catch {
		return undefined;
	}
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
