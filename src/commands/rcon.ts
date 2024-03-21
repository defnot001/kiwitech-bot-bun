import { ApplicationCommandOptionType, PermissionFlagsBits, codeBlock } from 'discord.js';
import type { ServerChoice } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { Command } from '../util/handler/classes/Command';
import { getServerChoices } from '../util/helpers';
import { LOGGER } from '../util/logger';
import rconUtil from '../util/rcon';

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
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const handler = new RconCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		const command = args.getString('command');

		if (!command?.trim()) {
			await interaction.editReply('You must provide a command to run!');
			return;
		}

		await handler.handleRun({
			serverChoice: args.getString('server') as ServerChoice,
			command,
		});
	},
});

class RconCommandHandler extends BaseKiwiCommandHandler {
	public async handleRun(args: { serverChoice: ServerChoice; command: string }) {
		if (
			args.serverChoice === 'smp' &&
			!this.member.permissions.has(PermissionFlagsBits.Administrator)
		) {
			await this.interaction.editReply(
				'You do not have the required permissions to run commands on this server.',
			);
			return;
		}

		const response = await rconUtil
			.runSingleCommand(args.serverChoice, args.command)
			.catch(async (e) => {
				await LOGGER.error(
					e,
					`Failed to run command "${args.command}" on server ${args.serverChoice}`,
				);
				return null;
			});

		if (response === null) {
			await this.interaction.editReply('Failed to run command on server!');
			return;
		}

		if (response === '') {
			await this.interaction.editReply(
				'Command was executed successfully but there is no response.',
			);
			return;
		}

		const maxMessageLength = 2000;

		if (response.length > maxMessageLength) {
			await this.interaction.editReply(
				'The response from the server to this command exceeds the message character limit. Consider using the panel for this specific command next time.',
			);

			return;
		}

		if (typeof response !== 'string') {
			await this.interaction.editReply('Failed to run command on server!');
			await LOGGER.error(
				new Error(`Server response to rcon command "${args.command} is not a string"`),
			);
			return;
		}

		await this.interaction.editReply(codeBlock(response));
	}
}
