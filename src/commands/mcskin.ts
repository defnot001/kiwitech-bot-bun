import { ApplicationCommandOptionType, AttachmentBuilder } from 'discord.js';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';

const SKIN_RENDER_TYPES = {
	default: ['full', 'bust', 'face'],
	marching: ['full', 'bust', 'face'],
	walking: ['full', 'bust', 'face'],
	crouching: ['full', 'bust', 'face'],
	crossed: ['full', 'bust', 'face'],
	criss_cross: ['full', 'bust', 'face'],
	ultimate: ['full', 'bust', 'face'],
	cheering: ['full', 'bust', 'face'],
	relaxing: ['full', 'bust', 'face'],
	trudging: ['full', 'bust', 'face'],
	cowering: ['full', 'bust', 'face'],
	pointing: ['full', 'bust', 'face'],
	lunging: ['full', 'bust', 'face'],
	isometric: ['full', 'bust', 'face', 'head'],
	head: ['full'],
	skin: ['default', 'processed'],
};

const choices = Object.keys(SKIN_RENDER_TYPES).map((name) => ({
	name,
	value: name,
}));

export const mcskin = new Command({
	name: 'mcskin',
	description: 'Get the minecraft skin of a player.',
	options: [
		{
			name: 'name',
			description: 'The minecraft name of the player you want the skin from.',
			type: ApplicationCommandOptionType.String,
			required: true,
		},
		{
			name: 'position',
			description: 'The position of the player in the skin.',
			type: ApplicationCommandOptionType.String,
			required: true,
			choices,
		},
		{
			name: 'type',
			description: 'The type of the image. Full is the default.',
			type: ApplicationCommandOptionType.String,
			required: false,
			choices: [
				{ name: 'full', value: 'full' },
				{ name: 'bust', value: 'bust' },
				{ name: 'face', value: 'face' },
				{ name: 'head', value: 'head' },
				{ name: 'default', value: 'default' },
				{ name: 'processed', value: 'processed' },
			],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const handler = new MCSkinCommandHandler({ interaction, client });
		if (!(await handler.init())) return;

		const playerName = args.getString('name', true);

		if (!playerName.trim().length) {
			await interaction.editReply('Please provide a valid username!');
			return;
		}

		await handler.handleMCSkin({
			playerName,
			renderPosition: args.getString('position', true) as keyof typeof SKIN_RENDER_TYPES,
			imageType: args.getString('type', false) as ImageType,
		});
	},
});

class MCSkinCommandHandler extends BaseKiwiCommandHandler {
	public async handleMCSkin(args: {
		playerName: string;
		renderPosition: keyof typeof SKIN_RENDER_TYPES;
		imageType: ImageType;
	}) {
		const { playerName, renderPosition, imageType } = args;

		if (SKIN_RENDER_TYPES[renderPosition].includes(imageType)) {
			await this.interaction.editReply(
				`Invalid image type for render position ${renderPosition}! Only ${SKIN_RENDER_TYPES[
					renderPosition
				].join(', ')} are allowed for this position!`,
			);
			return;
		}

		const url = `https://starlightskins.lunareclipse.studio/render/${renderPosition}/${playerName}/${imageType}`;

		const res = await fetch(url).catch(async (e) => {
			await LOGGER.error(e, `Failed to get the skin of ${playerName} from the starlightskins API`);
			return null;
		});

		if (!res) {
			await this.interaction.editReply('Failed to get the skin of the player!');
			return;
		}

		if (!res.ok) {
			await LOGGER.error(
				new Error(`${res.status}: ${res.statusText}`),
				`Failed to get the skin of ${playerName}`,
			);
			await this.interaction.editReply('Failed to get the skin of the player!');
			return;
		}

		const arrBuffer = await res.arrayBuffer().catch(async (e) => {
			await LOGGER.error(e, `Failed to transform the skin of ${playerName} to an array buffer`);
			return null;
		});

		if (!arrBuffer) {
			await this.interaction.editReply('Failed to get the skin of the player!');
			return;
		}

		const buffer = Buffer.from(arrBuffer);

		const skinAttachment = new AttachmentBuilder(buffer, {
			name: `${playerName}`,
			description: `Minecraft Skin of the player ${playerName}`,
		});

		await this.interaction.editReply({ files: [skinAttachment] });
	}
}

type ImageType = 'full' | 'bust' | 'face' | 'head' | 'default' | 'processed';
