import {
	TextChannel,
	type CommandInteractionOptionResolver,
	type Snowflake,
	type ChatInputCommandInteraction,
} from 'discord.js';
import { client } from '..';
import { LOGGER } from '../util/logger';
import type { ExtendedInteraction } from '../util/handler/types';
import { Event } from '../util/handler/classes/Event';
import { display } from '../util/format';

export default new Event('interactionCreate', async (interaction) => {
	if (!interaction.isChatInputCommand()) {
		return;
	}
	const { commandName } = interaction;

	const channelAddon = await getChannelNameAddon(interaction.channelId);
	const guildAddon = getGuildAddon(interaction);

	const command = client.commands.get(commandName);

	if (!command) {
		await LOGGER.error(
			`${display(
				interaction.user,
			)} used /${commandName}${channelAddon}${guildAddon} but the command does not exist.`,
		);

		await interaction.reply({
			content: 'This interaction does not exist!',
			ephemeral: true,
		});

		return;
	}

	LOGGER.info(`${display(interaction.user)} used /${commandName}${channelAddon}${guildAddon}.`);

	try {
		return command.execute({
			args: interaction.options as CommandInteractionOptionResolver,
			client,
			interaction: interaction as ExtendedInteraction,
		});
	} catch (e) {
		await LOGGER.error(
			e,
			`An uncaught error occurred while executing /${commandName}${channelAddon}${guildAddon}.`,
		);

		await interaction.reply({
			content: `There was an error trying to execute the interaction: ${interaction.commandName}!`,
			ephemeral: true,
		});

		return;
	}
});

async function getChannelNameAddon(channelID: Snowflake) {
	const channel = await client.channels.fetch(channelID);

	if (channel instanceof TextChannel) {
		return ` in ${display(channel)}`;
	}

	return '';
}

function getGuildAddon(interaction: ChatInputCommandInteraction) {
	if (interaction.guild) {
		return ` in ${display(interaction.guild)}`;
	}

	return '';
}
