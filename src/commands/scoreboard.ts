import path from 'node:path';
import { type Canvas, GlobalFonts, type SKRSContext2D, createCanvas } from '@napi-rs/canvas';
import { ApplicationCommandOptionType, bold, inlineCode } from 'discord.js';
import { projectPaths } from '../config';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';
import rconUtil from '../util/rcon';
import allScoreboards from '../util/scoreboards_1.19.2';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import type { ExtendedInteraction } from '../util/handler/types';
import type { ExtendedClient } from '../util/handler/classes/ExtendedClient';
import { escapeMarkdown } from '../util/helpers';

const scoreboardMap = allScoreboards;
export type Scoreboard = (typeof allScoreboards)[number]['stat'];

const choices = [
	{ name: 'mined', value: 'm' },
	{ name: 'used', value: 'u' },
	{ name: 'crafted', value: 'c' },
	{ name: 'broken (tools)', value: 'b' },
	{ name: 'picked up', value: 'p' },
	{ name: 'dropped', value: 'd' },
	{ name: 'killed', value: 'k' },
	{ name: 'killed by', value: 'kb' },
	{ name: 'custom', value: 'z' },
	{ name: 'extra', value: 'extra' },
] as const;

export type ScoreboardChoiceValue = (typeof choices)[number]['value'];

export const scoreboard = new Command({
	name: 'scoreboard',
	description: 'Shows the scoreboard for a given objective.',
	options: [
		{
			name: 'leaderboard',
			description: 'Gets a leaderboard for a given objective.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'action',
					description: 'The action to show the scoreboard for.',
					type: ApplicationCommandOptionType.String,
					required: true,
					choices: [...choices],
				},
				{
					name: 'item',
					description: 'The item to show the scoreboard for.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true,
				},
			],
		},
		{
			name: 'players',
			description: 'Gets the scoreboard of a specific player.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'playername',
					description: 'The player you want the scores for.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true,
				},
				{
					name: 'action',
					description: 'The action to show the scoreboard for.',
					type: ApplicationCommandOptionType.String,
					required: true,
					choices: [...choices],
				},
				{
					name: 'item',
					description: 'The item to show the scoreboard for.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true,
				},
			],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const handler = new ScoreboardCommandHandler({
			interaction,
			client,
			action: args.getString('action', true) as ScoreboardChoiceValue,
			item: args.getString('item', true),
		});

		if (!(await handler.init())) {
			return;
		}

		const subcommand = args.getSubcommand() as 'leaderboard' | 'players';

		if (subcommand === 'leaderboard') {
			await handler.handleLeaderboard();
			return;
		}

		if (subcommand === 'players') {
			await handler.handlePlayers({
				playerName: args.getString('playername', true),
			});
			return;
		}
	},
});

class ScoreboardCommandHandler extends BaseKiwiCommandHandler {
	private readonly action: ScoreboardChoiceValue;
	private readonly item: string;

	public constructor(options: {
		interaction: ExtendedInteraction;
		client: ExtendedClient;
		action: ScoreboardChoiceValue;
		item: string;
	}) {
		super(options);
		this.action = options.action;
		this.item = options.item;
	}

	public async handleLeaderboard() {
		const scoreboardChoice = this.action !== 'extra' ? `${this.action}-${this.item}` : this.item;
		const scoreboardName = scoreboardMap.find((x) => x.stat === scoreboardChoice)?.translation;

		if (!scoreboardName) {
			await this.interaction.editReply(`Scoreboard ${scoreboardChoice} does not exist!`);
			return;
		}

		let buffer: Buffer | null = null;

		if (scoreboardChoice === 'z-play_time') {
			const leaderboard = await this.getPlaytimeLeaderboard();

			if (!leaderboard) {
				await this.interaction.editReply('Failed to get playtime leaderboard!');
				return;
			}

			buffer = await this.createImageFromScoreboard({
				scoreboardName: 'SMP Play Time (hours)',
				scoreboardData: leaderboard,
			});
		} else {
			const leaderboard = await this.queryScoreboard(scoreboardChoice as Scoreboard);

			if (!leaderboard) {
				await this.interaction.editReply(`Failed to get leaderboard for ${scoreboardName}!`);
				return;
			}

			buffer = await this.createImageFromScoreboard({
				scoreboardName,
				scoreboardData: leaderboard,
			});
		}

		if (!buffer) {
			await this.interaction.editReply('Failed to create image from scoreboard!');
			return;
		}

		await this.interaction.editReply({ files: [{ attachment: buffer }] });
	}
	public async handlePlayers(args: { playerName: string }) {
		if (!args.playerName.trim().length) {
			await this.interaction.editReply('Please provide a valid player name!');
			return;
		}

		const scoreboardChoice = this.action !== 'extra' ? `${this.action}-${this.item}` : this.item;
		const scoreboardName = scoreboardMap.find((x) => x.stat === scoreboardChoice)?.translation;

		if (!scoreboardName) {
			await this.interaction.editReply(`Scoreboard ${scoreboardChoice} does not exist!`);
			return;
		}

		const score = await this.getPlayerScore(args.playerName, scoreboardChoice as Scoreboard);

		if (score === null) {
			await this.interaction.editReply(
				`Cannot find score ${scoreboardName} for ${args.playerName}!`,
			);
			return;
		}

		const displayValue = scoreboardChoice !== 'z-play_time' ? score : Math.round(score / 20 / 3600);
		const displayAction =
			scoreboardChoice === 'z-play_time' ? 'SMP Play Time (hours)' : scoreboardName;

		await this.interaction.editReply(
			`Player ${escapeMarkdown(args.playerName)} has ${inlineCode(
				displayValue.toString(),
			)} for scoreboard: ${bold(displayAction)}.`,
		);
	}

	/**
	 * Query the scoreboard for a given objective. Returns a list of players and their scores and a total score.
	 * Returns null if the scoreboard does not exist or if an error occurred.
	 * @sideeffect Logs errors.
	 */
	private async queryScoreboard(
		scoreboardName: Scoreboard,
	): Promise<QueryScoreboardResponse | null> {
		const query = `script run scores={};for(system_info('server_whitelist'), scores:_=scoreboard('${scoreboardName}', _));encode_json(scores)`;

		const data = await rconUtil.runSingleCommand('smp', query).catch(async (e) => {
			await LOGGER.error(e, `Failed to get scoreboard ${scoreboardName}`);
			return null;
		});

		if (!data) {
			return null;
		}

		let response: Record<string, number | null> | null = null;

		try {
			response = JSON.parse(data.replace(/\(.+\)$/, '').replace(/^ =/, ''));
		} catch (e) {
			await LOGGER.error(e, 'Failed to parse scoreboard data');
			return null;
		}

		if (!response) {
			return null;
		}

		const list = Object.entries(response)
			.filter(([, score]) => score !== null)
			.map(([ign, score]) => ({
				ign,
				score: score ?? 0,
			}))
			.sort((a, b) => b.score - a.score);

		const total = list.reduce((acc, cur) => acc + cur.score, 0);

		return {
			list,
			total,
		};
	}

	/**
	 * Get the playtime leaderboard as a list of players and their scores and a total score.
	 * Returns null if an error occurred.
	 * @sideeffect Logs errors.
	 */
	private async getPlaytimeLeaderboard() {
		const result = await this.queryScoreboard('z-play_time');

		if (!result) {
			return null;
		}

		result.total = Math.round(result.total / 20 / 3600);

		for (const [i, { score }] of result.list.entries()) {
			const entry = result.list[i];

			if (!entry) {
				continue;
			}

			entry.score = Math.round(score / 20 / 3600);
		}

		return result;
	}

	/**
	 * Get the score of a player in a given scoreboard.
	 * Returns the score if successful, 0 if the player has no score, and null if an error occurred.
	 * @sideeffect Logs errors.
	 */
	private async getPlayerScore(ign: string, scoreboard: Scoreboard) {
		const rconResponse = await rconUtil
			.runSingleCommand('smp', `scoreboard players get ${ign} ${scoreboard}`)
			.catch(async (e) => {
				await LOGGER.error(e, `Failed to get score for ${ign} in ${scoreboard}`);
				return null;
			});

		if (!rconResponse) {
			return null;
		}

		if (rconResponse === `Can't get value of ${scoreboard} for ${ign}; none is set`) {
			return 0;
		}

		if (rconResponse.startsWith(`${ign} has`)) {
			try {
				return Number.parseInt(rconResponse.split(' ')[2] as string, 10);
			} catch (e) {
				await LOGGER.error(e, 'Failed to parse score');
				return null;
			}
		}

		return null;
	}

	/**
	 * Create an image from a scoreboard.
	 * Returns the image buffer if successful, null if an error occurred.
	 * @sideeffect Logs errors.
	 */
	private async createImageFromScoreboard(options: {
		scoreboardName: string;
		scoreboardData: QueryScoreboardResponse;
	}) {
		const { scoreboardName, scoreboardData } = options;

		try {
			GlobalFonts.registerFromPath(
				path.join(projectPaths.sources, 'assets/minecraft.ttf'),
				'minecraft',
			);
		} catch (e) {
			await LOGGER.error(e, 'Failed to register minecraft image font');
		}

		enum ScoreboardConstants {
			gray = '#BFBFBF',
			red = '#FF5555',
			white = '#FFFFFF',
			width = 250,
			spacing = 20,
		}

		if (scoreboardData.list.length > 15) {
			scoreboardData.list.splice(16, scoreboardData.list.length - 16);
		}

		const canvasHeight = scoreboardData.list.length * ScoreboardConstants.spacing + 55;

		let canvas: Canvas | null = null;

		try {
			canvas = createCanvas(250, canvasHeight);
		} catch (e) {
			await LOGGER.error(e, 'Failed to create canvas');
		}

		if (!canvas) {
			return null;
		}

		let ctx: SKRSContext2D | null = null;

		try {
			ctx = canvas.getContext('2d');
		} catch (e) {
			await LOGGER.error(e, 'Failed to get canvas context');
		}

		if (!ctx) {
			return null;
		}

		ctx.fillStyle = '#2c2f33';

		try {
			ctx.fillRect(0, 0, ScoreboardConstants.width, canvasHeight);
		} catch (e) {
			await LOGGER.error(e, 'Failed to fill canvas');
			return null;
		}

		ctx.font = '20px minecraft';

		try {
			const titleSize = ctx.measureText(scoreboardName);

			let scoreboardTitle = scoreboardName;

			if (titleSize.width > ScoreboardConstants.width - 10) {
				let title = scoreboardName;
				let width = titleSize.width;

				while (width > ScoreboardConstants.width - 30) {
					title = title.slice(0, -1);
					width = ctx.measureText(title).width;
				}
				scoreboardTitle = `${title}...`;
			}

			const titlePos = [
				Math.floor((ScoreboardConstants.width - ctx.measureText(scoreboardTitle).width) / 2),
				20,
			];

			const playerAndScorePos: [number, number] = [2, 50];

			if (!titlePos[0] || !titlePos[1]) {
				await LOGGER.error(new Error('Failed to calculate title position for scoreboard image'));
			}

			// Write title
			ctx.fillStyle = ScoreboardConstants.white;
			ctx.fillText(scoreboardTitle, titlePos[0], titlePos[1], 240);

			let counter = 0;

			for (const e of scoreboardData.list) {
				// Write the player name
				ctx.fillStyle = ScoreboardConstants.gray;
				ctx.fillText(
					e.ign,
					playerAndScorePos[0],
					playerAndScorePos[1] + counter * ScoreboardConstants.spacing,
				);

				// Write the score
				ctx.fillStyle = ScoreboardConstants.red;
				ctx.fillText(
					e.score.toString(),
					ScoreboardConstants.width - ctx.measureText(e.score.toString()).width,
					playerAndScorePos[1] + counter * ScoreboardConstants.spacing,
				);

				counter += 1;
			}

			// Write the total score (in red)
			ctx.fillText(
				scoreboardData.total.toString(),
				ScoreboardConstants.width - ctx.measureText(scoreboardData.total.toString()).width,
				playerAndScorePos[1] + counter * ScoreboardConstants.spacing,
			);

			// Write 'Total' text
			ctx.fillStyle = ScoreboardConstants.white;
			ctx.fillText(
				'Total',
				playerAndScorePos[0],
				playerAndScorePos[1] + counter * ScoreboardConstants.spacing,
			);

			return canvas.toBuffer('image/png');
		} catch (e) {
			await LOGGER.error(e, 'Failed to draw on canvas');
			return null;
		}
	}
}

type QueryScoreboardResponse = {
	list: {
		ign: string;
		score: number;
	}[];
	total: number;
};
