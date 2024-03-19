import { ApplicationCommandOptionType, AttachmentBuilder, inlineCode } from 'discord.js';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';
import MojangAPI from '../util/mojang';

export const mcskin = new Command({
	name: 'mcskin',
	description: 'Get the minecraft skin of a player.',
	options: [
		{
			name: 'type',
			description: 'The type of skin image you want to get.',
			type: ApplicationCommandOptionType.String,
			required: true,
			choices: [
				{ name: 'avatar', value: '/avatars/' },
				{ name: 'head', value: '/renders/head/' },
				{ name: 'body', value: '/renders/body/' },
				{ name: 'skin', value: '/skins/' },
			],
		},
		{
			name: 'name',
			description: 'The minecraft name of the player you want the skin from.',
			type: ApplicationCommandOptionType.String,
			required: true,
		},
	],
	execute: async ({ interaction, args }) => {
		await interaction.deferReply();

		if (!interaction.guild) {
			await interaction.editReply('This command can only be used in a server!');
			return;
		}

		const name = args.getString('name');

		if (!name) {
			await interaction.editReply('Please provide a username!');
			return;
		}

		const imageType = args.getString('type', true) as ImageType;

		try {
			const uuid = await MojangAPI.getUUID(name);

			if (!uuid) {
				await interaction.editReply(
					`Could not find the UUID for ${inlineCode(name)} from the Mojang API!`,
				);
				return;
			}

			const skin = await getPlayerSkin(uuid.id, name, imageType);

			if (!skin) {
				await interaction.editReply(
					`Could not find the skin for ${inlineCode(name)} from the crafatar API!`,
				);
				return;
			}

			await interaction.editReply({ files: [skin] });
		} catch (e) {
			await interaction.editReply('An error occurred while trying to get the skin!');
			await LOGGER.error(e, 'Failed to get the skin of a player.');

			return;
		}
	},
});

async function getPlayerSkin(uuid: string, name: string, imageType: ImageType) {
	const url = `https://crafatar.com${imageType}${uuid}`;

	try {
		const skinRes = await fetch(url);

		if (!skinRes.ok) {
			throw new Error(`${skinRes.status}: ${skinRes.statusText}`);
		}

		const arrBuffer = await skinRes.arrayBuffer();
		const buffer = Buffer.from(arrBuffer);

		const skinAttachment = new AttachmentBuilder(buffer, {
			name: `${name}.png`,
			description: `Minecraft Skin of the player ${name}`,
		});

		return skinAttachment;
	} catch (e) {
		await LOGGER.error(e, `Failed to get the skin of ${name} from the crafatar API.`);
		return null;
	}
}

type ImageType = '/avatars/' | '/renders/head/' | '/renders/body/' | '/skins/';
