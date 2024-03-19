import { ApplicationCommandOptionType, codeBlock } from 'discord.js';
import type { ServerChoice } from '../config';
import { Command } from '../util/handler/classes/Command';
import { getServerChoices, isAdmin } from '../util/helpers';
import { LOGGER } from '../util/logger';
import RCONUtil from '../util/rcon';

export const rcon = new Command({
	name: 'run',
	description: 'Runs a command on a Minecraft Server.',
	options: [
		{
			name: 'server',
			description: 'Choose a server.',
			type: ApplicationCommandOptionType.String,
			required: true,
			choices: [...getServerChoices()],
		},
		{
			name: 'command',
			description: 'The command you want to run on the server.',
			type: ApplicationCommandOptionType.String,
			required: true,
		},
	],
	execute: async ({ interaction, args }) => {
		await interaction.deferReply();

		const choice = args.getString('server', true) as ServerChoice;

		if (choice === 'smp' && !isAdmin(interaction.member)) {
			return interaction.editReply(
				'You do not have the required permissions to run commands on this server.',
			);
		}

		const command = args.getString('command');

		if (!choice || !command) {
			return interaction.editReply('Missing arguments for this command!');
		}

		if (!interaction.guild) {
			return interaction.editReply('This command can only be used in a server!');
		}

		try {
			const response =
				(await RCONUtil.runSingleCommand(choice, command)) ||
				'Command was executed successfully but there is no response.';

			const maxMessageLength = 2000;

			if (response.length > maxMessageLength) {
				return interaction.editReply(
					'The response from the server to this command exceeds the message character limit. Consider using the panel for this specific command next time.',
				);
			}

			return interaction.editReply(codeBlock(response.toString()));
		} catch (e) {
			await LOGGER.error(e, `Failed to run command on server ${choice}`);
			await interaction.editReply('Failed to run command on server !');
			return;
		}
	},
});
