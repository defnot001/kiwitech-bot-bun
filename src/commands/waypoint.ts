import { createHash } from 'node:crypto';
import { ApplicationCommandOptionType, AttachmentBuilder, inlineCode } from 'discord.js';
import sharp from 'sharp';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { config } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { displayTime } from '../util/format';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';
import { ptero } from '../util/pterodactyl';

export const waypoint = new Command({
	name: 'waypoint',
	description: 'Get the coordinates of a waypoint.',
	options: [
		{
			name: 'list',
			description: 'List all SMP Waypoints.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'dimension',
					description: 'The dimension you want the waypoint list from.',
					type: ApplicationCommandOptionType.String,
					required: true,
					choices: [
						{ name: 'Overworld', value: 'overworld' },
						{ name: 'Nether', value: 'the_nether' },
						{ name: 'End', value: 'the_end' },
						{ name: 'All', value: 'all' },
					],
				},
			],
		},
		{
			name: 'find',
			description: 'Get a waypoint from SMP.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'name',
					description: 'The waypoint you want to get the location of.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true,
				},
			],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const handler = new WaypointCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		const subcommand = args.getSubcommand() as 'list' | 'find';

		if (subcommand === 'list') {
			await handler.handleList({
				dimension: args.getString('dimension', true) as Dimension | 'all',
			});
			return;
		}

		if (subcommand === 'find') {
			await handler.handleFind({ waypointName: args.getString('name', true) });
			return;
		}
	},
});

class WaypointCommandHandler extends BaseKiwiCommandHandler {
	public async handleFind(args: { waypointName: string }) {
		const { waypointName } = args;

		const waypoints = await fetchWaypoints();

		if (!waypoints) {
			await this.interaction.editReply('Failed to fetch waypoints from the server!');
			return;
		}

		const targetWaypoint = waypoints.find((w) => w.name === waypointName);

		if (!targetWaypoint) {
			await this.interaction.editReply(`Cannot find waypoint: "${waypointName}"`);
			return;
		}

		const locations = this.getWaypointLocations(targetWaypoint);

		let createdAtDate: Date | null = null;

		try {
			createdAtDate = new Date(targetWaypoint.creationTime);
		} catch (e) {
			await LOGGER.error(e, `Failed to parse creation time for waypoint ${waypointName}s`);
		}

		const waypointEmbed = new KoalaEmbedBuilder(this.user, {
			title: `${this.guild.name} SMP Waypoint`,
			fields: [
				{ name: 'Name', value: targetWaypoint.name },
				{ name: 'Coordinates', value: locations.join('\n') },
				{ name: 'Author', value: targetWaypoint.authorName },
			],
		});

		if (createdAtDate) {
			waypointEmbed.addFields([{ name: 'Created at', value: displayTime(createdAtDate) }]);
		}

		if (targetWaypoint.icon) {
			const icon = await this.getImageFile(targetWaypoint.icon);

			if (icon) {
				const resizedIcon = await this.scaleWaypointIcon({
					image: icon,
					newWidth: 64,
					newHeight: 64,
				});

				if (resizedIcon) {
					const attachment = new AttachmentBuilder(resizedIcon, { name: 'icon.png' });

					waypointEmbed.setThumbnail('attachment://icon.png');

					await this.interaction.editReply({ embeds: [waypointEmbed], files: [attachment] });
					return;
				}
			}
		}

		if (this.guild.iconURL()) {
			waypointEmbed.setThumbnail(this.guild.iconURL());
		}

		await this.interaction.editReply({ embeds: [waypointEmbed] });
	}
	public async handleList(args: { dimension: Dimension | 'all' }) {
		const { dimension } = args;

		const waypoints = await fetchWaypoints();

		if (!waypoints) {
			await this.interaction.editReply('Failed to fetch waypoints from the server!');
			return;
		}

		const dimensionLookupTable = {
			overworld: 'Overworld',
			the_nether: 'The Nether',
			the_end: 'The End',
		};

		if (dimension === 'all') {
			const embeds: KoalaEmbedBuilder[] = [];

			for (const dimension of Object.keys(dimensionLookupTable) as Dimension[]) {
				const list = this.getWaypointNamesByDimension({ waypoints, dimension });

				const embed = new KoalaEmbedBuilder(this.user, {
					title: `${this.guild.name} Waypoints ${dimensionLookupTable[dimension]}`,
					description: list.join('\n'),
				});

				embeds.push(embed);
			}

			await this.interaction.editReply({ embeds });
			return;
		}

		const list = this.getWaypointNamesByDimension({ waypoints, dimension });

		const embed = new KoalaEmbedBuilder(this.user, {
			title: `${this.guild.name} Waypoints ${dimensionLookupTable[dimension]}`,
			description: list.join('\n'),
		});

		await this.interaction.editReply({ embeds: [embed] });
	}

	private getWaypointLocations(waypoint: Waypoint): string[] {
		const dimensionLookupTable = {
			'minecraft:overworld': 'Overworld',
			'minecraft:the_nether': 'The Nether',
			'minecraft:the_end': 'The End',
		} as const;

		const locations: string[] = [];

		for (const dimension of waypoint.dimensions) {
			const dimensionName = dimensionLookupTable[dimension as keyof typeof dimensionLookupTable];

			if (dimensionName === 'The Nether') {
				locations.push(
					`${dimensionName}: ${inlineCode(
						`${Math.floor(waypoint.pos[0] / 8)} ${Math.floor(waypoint.pos[1] / 8)} ${Math.floor(
							waypoint.pos[2] / 8,
						)}`,
					)}`,
				);

				continue;
			}

			locations.push(
				`${dimensionName}: ${inlineCode(
					`${waypoint.pos[0]} ${waypoint.pos[1]} ${waypoint.pos[2]}`,
				)}`,
			);
		}

		return locations;
	}

	private getWaypointNamesByDimension(options: {
		waypoints: Waypoint[];
		dimension: Dimension;
	}): string[] {
		const { waypoints, dimension } = options;

		return waypoints
			.filter((w) => w.dimensions.includes(`minecraft:${dimension}`))
			.map((w) => w.name);
	}

	private async getImageFile(iconName: string): Promise<Buffer | null> {
		const buffer = new Uint8Array(iconName.length * 2);

		for (let i = 0; i < iconName.length; i++) {
			const char = iconName.charCodeAt(i);

			buffer[i * 2] = char & 0xff;
			buffer[i * 2 + 1] = char >> 8;
		}

		const hash = createHash('sha1').update(buffer).digest('hex');

		const illegalChars = [
			'/',
			'.',
			'\n',
			'\r',
			'\t',
			'\u0000',
			'\f',
			'`',
			'?',
			'*',
			'\\',
			'<',
			'>',
			'|',
			'"',
			':',
		];

		let replacedIconName = iconName;

		for (const illegalChar of illegalChars) {
			replacedIconName = iconName.replace(illegalChar, '_');
		}

		const imageLink = await ptero.files
			.getDownloadLink(
				config.mcConfig.smp.serverId,
				`/world/minimapsync_icons/${replacedIconName}_${hash}.png`,
			)
			.catch(async (e) => {
				await LOGGER.error(e, 'Failed to get image link for waypoint icon');
				return null;
			});

		if (!imageLink) {
			return null;
		}

		const imageResponse = await fetch(imageLink).catch(async (e) => {
			await LOGGER.error(e, 'Failed to fetch image for waypoint icon from download link');
			return null;
		});

		if (!imageResponse) {
			return null;
		}

		const arrayBuffer = await imageResponse.arrayBuffer().catch(async (e) => {
			await LOGGER.error(e, 'Failed to convert image response to array buffer');
			return null;
		});

		if (!arrayBuffer) {
			return null;
		}

		return Buffer.from(arrayBuffer);
	}

	private async scaleWaypointIcon(options: {
		image: Buffer;
		newWidth: number;
		newHeight: number;
	}): Promise<Buffer | null> {
		let resized: Buffer | null = null;

		try {
			resized = await sharp(options.image)
				.resize({
					width: options.newHeight,
					height: options.newHeight,
					fit: 'contain',
					background: { r: 0, g: 0, b: 0, alpha: 0 },
					kernel: sharp.kernel.nearest,
				})
				.toBuffer();
		} catch (e) {
			await LOGGER.error(e, 'Failed to resize waypoint icon');
			return null;
		}

		return resized;
	}
}

type Dimension = 'overworld' | 'the_nether' | 'the_end';

type WaypointFile = {
	formatVersion: number;
	waypoints: {
		waypoints: Waypoint[];
	};
	teleportRule: string;
	icons: string[];
};

type Waypoint = {
	name: string;
	color: number;
	dimensions: string[];
	pos: [number, number, number];
	author: string;
	authorName: string;
	icon?: string;
	creationTime: number;
	isPrivate?: boolean;
};

export async function fetchWaypoints(): Promise<Waypoint[] | null> {
	const fileContent = await ptero.files
		.getContent(config.mcConfig.smp.serverId, 'world/minimapsync.json')
		.catch(async (e) => {
			await LOGGER.error(e, 'Failed to get waypoint file');
			return null;
		});

	if (!fileContent) {
		return null;
	}

	const waypointsFile = fileContent as WaypointFile;
	const waypoints = waypointsFile.waypoints.waypoints;

	return waypoints.filter((w) => !w.isPrivate);
}
