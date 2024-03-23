import { ApplicationCommandOptionType } from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { type ServerChoice, config } from '../config';
import { Rcon } from '../rcon/rcon';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { Command } from '../util/handler/classes/Command';
import { escapeMarkdown, getServerChoices } from '../util/helpers';
import { LOGGER } from '../util/logger';
import RCONUtil from '../util/rcon';

export const whitelist = new Command({
	name: 'whitelist',
	description: 'Get information about the whitelist & add/remove users.',
	options: [
		{
			name: 'add',
			description: 'Adds a player to the whitelist on all minecraft servers.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'ign',
					description: `The player's in-game name.`,
					type: ApplicationCommandOptionType.String,
					required: true,
				},
			],
		},
		{
			name: 'remove',
			description: 'Removes a player from the whitelist on all minecraft servers.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'ign',
					description: `The player's in-game name.`,
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true,
				},
			],
		},
		{
			name: 'list',
			description: 'Returns the whitelist of the specified server in an embed.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'server',
					description: 'Specify a server.',
					type: ApplicationCommandOptionType.String,
					choices: [...getServerChoices()],
					required: true,
				},
			],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const handler = new WhitelistCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		const subcommand = args.getSubcommand() as 'add' | 'remove' | 'list';

		if (subcommand === 'list') {
			const serverChoice = args.getString('server', true) as ServerChoice;

			await handler.handleList({ serverChoice });
			return;
		}

		const ign = args.getString('ign', true);

		if (!ign.trim()) {
			await interaction.editReply('Please provide a valid ign!');
			return;
		}

		if (subcommand === 'add') {
			await handler.handleAdd({ ign });
			return;
		}

		if (subcommand === 'remove') {
			await handler.handleRemove({ ign });
			return;
		}
	},
});

type OperationResult = 'success' | 'already' | 'fail';

class WhitelistCommandHandler extends BaseKiwiCommandHandler {
	public async handleList(args: { serverChoice: ServerChoice }) {
		const whitelist = await getWhitelistedPlayers(args.serverChoice);

		if (whitelist === null) {
			await this.interaction.editReply('Failed to fetch whitelist from the server!');
			return;
		}

		if (!whitelist.length) {
			await this.interaction.editReply(`There are no whitelisted players on ${args.serverChoice}!`);
			return;
		}

		const whitelistEmbed = new KoalaEmbedBuilder(this.user, {
			title: `${args.serverChoice.toUpperCase()} Whitelist`,
			description: whitelist.map((player) => escapeMarkdown(player)).join('\n'),
		});

		if (this.guild.iconURL()) {
			whitelistEmbed.setThumbnail(this.guild.iconURL());
		}

		await this.interaction.editReply({ embeds: [whitelistEmbed] });
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: <explanation>
	public async handleAdd(args: { ign: string }) {
		const configServers = Object.keys(config.mcConfig) as ServerChoice[];

		const whitelistAddResults: [ServerChoice, OperationResult][] = [];
		const opResults: [ServerChoice, OperationResult][] = [];

		for (const server of configServers) {
			const rconClient = await Rcon.connect({
				host: config.mcConfig[server].host,
				port: config.mcConfig[server].rconPort,
				password: config.mcConfig[server].rconPasswd,
			});

			const whitelistResponse = await rconClient
				.send(`whitelist add ${args.ign}`)
				.catch(async () => {
					await LOGGER.warn(`Failed to add ${args.ign} to the whitelist on ${server}`);
					return null;
				});

			if (whitelistResponse === null) {
				whitelistAddResults.push([server, 'fail']);
			}

			if (whitelistResponse === 'Player is already whitelisted') {
				whitelistAddResults.push([server, 'already']);
			}

			if (whitelistResponse === `Added ${args.ign} to the whitelist`) {
				whitelistAddResults.push([server, 'success']);
			}

			if (config.mcConfig[server].operator === true) {
				const opResponse = await rconClient.send(`op ${args.ign}`).catch(async () => {
					await LOGGER.warn(`Failed to make ${args.ign} an operator on ${server}`);
					return null;
				});

				if (opResponse === null) {
					opResults.push([server, 'fail']);
				}

				if (opResponse === 'Nothing changed. The player already is an operator') {
					opResults.push([server, 'already']);
				}

				if (opResponse === `Made ${args.ign} a server operator`) {
					opResults.push([server, 'success']);
				}
			}

			await rconClient.end();
		}

		const whitelistSuccess = whitelistAddResults.every(([, result]) => result === 'success');
		const opSuccess = opResults.every(([, result]) => result === 'success');

		if (whitelistSuccess && opSuccess) {
			await this.interaction.editReply(`Successfully whitelisted ${args.ign} on all servers!`);
			return;
		}

		const transformed = this.transformRconResults({
			whitelistResults: whitelistAddResults,
			opResults,
		});

		const resultEmbed = this.buildResultEmbed(args.ign, transformed);
		await this.interaction.editReply({ embeds: [resultEmbed] });
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: <explanation>
	public async handleRemove(args: { ign: string }) {
		const servers = Object.keys(config.mcConfig) as ServerChoice[];

		const whitelistRemoveResults: [ServerChoice, OperationResult][] = [];
		const opResults: [ServerChoice, OperationResult][] = [];

		for (const server of servers) {
			const rconClient = await Rcon.connect({
				host: config.mcConfig[server].host,
				port: config.mcConfig[server].rconPort,
				password: config.mcConfig[server].rconPasswd,
			});

			const whitelistResponse = await rconClient
				.send(`whitelist remove ${args.ign}`)
				.catch(async () => {
					await LOGGER.warn(`Failed to remove ${args.ign} from the whitelist on ${server}`);
					return null;
				});

			if (whitelistResponse === null) {
				whitelistRemoveResults.push([server, 'fail']);
			}

			if (whitelistResponse === 'Player is not whitelisted') {
				whitelistRemoveResults.push([server, 'already']);
			}

			if (whitelistResponse === `Removed ${args.ign} from the whitelist`) {
				whitelistRemoveResults.push([server, 'success']);
			}

			if (config.mcConfig[server].operator === true) {
				const opResponse = await rconClient.send(`deop ${args.ign}`).catch(async () => {
					await LOGGER.warn(`Failed to remove ${args.ign} as an operator on ${server}`);
					return null;
				});

				if (opResponse === null) {
					opResults.push([server, 'fail']);
				}

				if (opResponse === 'Nothing changed. The player is not an operator') {
					opResults.push([server, 'already']);
				}

				if (opResponse === `Made ${args.ign} no longer a server operator`) {
					opResults.push([server, 'success']);
				}
			}

			await rconClient.end();
		}

		const whitelistSuccess = whitelistRemoveResults.every(([, result]) => result === 'success');
		const opSuccess = opResults.every(([, result]) => result === 'success');

		if (whitelistSuccess && opSuccess) {
			await this.interaction.editReply(`Successfully removed ${args.ign} from all servers!`);
			return;
		}

		const transformed = this.transformRconResults({
			whitelistResults: whitelistRemoveResults,
			opResults,
		});

		const resultEmbed = this.buildResultEmbed(args.ign, transformed);
		await this.interaction.editReply({ embeds: [resultEmbed] });
	}

	private transformRconResults(options: {
		whitelistResults: [ServerChoice, OperationResult][];
		opResults: [ServerChoice, OperationResult][];
	}): {
		success: ActionResult;
		already: ActionResult;
		fail: ActionResult;
	} {
		const { whitelistResults, opResults } = options;

		const success: ActionResult = [];
		const already: ActionResult = [];
		const fail: ActionResult = [];

		for (const [server, result] of whitelistResults) {
			if (result === 'success') {
				success.push(['whitelist', server]);
			}

			if (result === 'already') {
				already.push(['whitelist', server]);
			}

			if (result === 'fail') {
				fail.push(['whitelist', server]);
			}
		}

		for (const [server, result] of opResults) {
			if (result === 'success') {
				success.push(['op', server]);
			}

			if (result === 'already') {
				already.push(['op', server]);
			}

			if (result === 'fail') {
				fail.push(['op', server]);
			}
		}

		return { success, already, fail };
	}

	private buildResultEmbed(
		ign: string,
		transformed: {
			success: ActionResult;
			already: ActionResult;
			fail: ActionResult;
		},
	) {
		const { success, already, fail } = transformed;

		return new KoalaEmbedBuilder(this.user, {
			title: `Whitelist Results for ${ign}`,
			fields: [
				{
					name: 'Successful',
					value: success.map(([action, server]) => `${server} (${action})`).join('\n'),
				},
				{
					name: 'Already Done',
					value: already.map(([action, server]) => `${server} (${action})`).join('\n'),
				},
				{
					name: 'Failed',
					value: fail.map(([action, server]) => `${server} (${action})`).join('\n'),
				},
			],
		});
	}
}

type ActionResult = ['op' | 'whitelist', ServerChoice][];

/**
 * Gets the whitelisted players from the specified server sorted alphabetically.
 * Returns null if there was an error.
 * @sideeffect Logs errors.
 */
export async function getWhitelistedPlayers(server: ServerChoice): Promise<string[] | null> {
	const rconResponse = await RCONUtil.runSingleCommand(server, 'whitelist list').catch(
		async (e) => {
			await LOGGER.error(e, `Failed to fetch whitelist for ${server}`);
			return null;
		},
	);

	if (!rconResponse) {
		return null;
	}

	if (rconResponse === 'There are no whitelisted players') {
		return [];
	}

	const splitResponse = rconResponse.split(': ')[1];

	if (!splitResponse) {
		await LOGGER.error(`Failed to parse whitelist response for ${server}`);
		return null;
	}

	return splitResponse
		.split(', ')
		.sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase()));
}
