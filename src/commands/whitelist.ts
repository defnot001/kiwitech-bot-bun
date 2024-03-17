import { ApplicationCommandOptionType, inlineCode } from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { type ServerChoice, config } from '../config';
import { Rcon } from '../rcon/rcon';
import { ERROR_MESSAGES } from '../util/constants';
import { Command } from '../util/handler/classes/Command';
import { escapeMarkdown, getServerChoices } from '../util/helpers';
import { LOGGER } from '../util/logger';
import RCONUtil from '../util/rcon';

export default new Command({
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
	execute: async ({ interaction, args }) => {
		await interaction.deferReply();

		const subcommand = args.getSubcommand();

		if (!subcommand) {
			return interaction.editReply('This subcommand does not exist!');
		}

		if (!interaction.guild) {
			return interaction.reply(ERROR_MESSAGES.ONLY_GUILD);
		}

		try {
			if (subcommand === 'list') {
				const choice = args.getString('server', true) as ServerChoice;

				if (!choice) {
					return interaction.editReply('Please specify a server!');
				}

				const response = await getWhitelist(choice);

				const whitelist = !response
					? `There are no whitelisted players on ${choice}!`
					: response.map((ign) => escapeMarkdown(ign)).join('\n');

				const whitelistEmbed = new KoalaEmbedBuilder(interaction.user, {
					title: `${choice.toUpperCase()} Whitelist`,
					description: whitelist,
				});

				const iconURL = interaction.guild.iconURL();

				if (iconURL) {
					whitelistEmbed.setThumbnail(iconURL);
				}

				await interaction.editReply({ embeds: [whitelistEmbed] });
				return;
			}

			const ign = args.getString('ign');

			if (!ign) {
				return interaction.editReply('Please provide an in-game name!');
			}

			const servers = Object.keys(config.mcConfig) as ServerChoice[];

			const whitelistCheck: [ServerChoice, string][] = [];
			const opCheck: [ServerChoice, string][] = [];

			for await (const server of servers) {
				const rconClient = await Rcon.connect({
					host: config.mcConfig[server].host,
					port: config.mcConfig[server].rconPort,
					password: config.mcConfig[server].rconPasswd,
				});

				whitelistCheck.push([server, await rconClient.send(`whitelist ${subcommand} ${ign}`)]);

				if (config.mcConfig[server].operator === true) {
					const action = subcommand === 'add' ? 'op' : 'deop';
					opCheck.push([server, await rconClient.send(`${action} ${ign}`)]);
				}

				await rconClient.end();
			}

			const successMessage =
				subcommand === 'add'
					? `Successfully added ${inlineCode(ign)} to the whitelist on ${
							whitelistCheck.length
					  } servers.\nSuccessfully made ${inlineCode(ign)} an operator on ${
							opCheck.length
					  } servers.`
					: `Successfully removed ${inlineCode(ign)} from the whitelist on ${
							whitelistCheck.length
					  } servers.\nSuccessfully removed ${inlineCode(ign)} as an operator on ${
							opCheck.length
					  } servers.`;

			await interaction.editReply(successMessage);
		} catch (e) {
			await interaction.editReply(
				`There was an error trying to execute the whitlist ${subcommand} command!`,
			);
			await LOGGER.error(e, `Failed to execute the whitelist ${subcommand} command!`);
		}

		return;
	},
});

export async function getWhitelist(server: ServerChoice) {
	const response = await RCONUtil.runSingleCommand(server, 'whitelist list');

	if (response === 'There are no whitelisted players') {
		return [];
	}

	const splitResponse = response.split(': ')[1];

	if (!splitResponse) {
		throw new Error('Failed to parse the response correctly!');
	}

	return splitResponse.split(', ').sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
