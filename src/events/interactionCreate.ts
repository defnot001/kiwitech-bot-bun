import type { CommandInteractionOptionResolver, TextBasedChannel } from 'discord.js';
import { client } from '..';
import { Event } from '../util/handler/classes/Event';
import type { ExtendedInteraction } from '../util/handler/types';
import { LOGGER } from '../util/logger';

export default new Event('interactionCreate', async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const command = client.commands.get(interaction.commandName);

	const getChannelName = (channel: TextBasedChannel | null): string | null => {
		if (channel && 'name' in channel) {
			return channel.name;
		}

		return null;
	};

	const channelNameAddon: string = `in #${getChannelName(interaction.channel)}` || '';

	console.log(`${interaction.user.username} ${channelNameAddon} triggered an interaction.`);

	if (!command) {
		return interaction.reply({
			content: 'This interaction does not exist!',
			ephemeral: true,
		});
	}

	try {
		command.execute({
			args: interaction.options as CommandInteractionOptionResolver,
			client,
			interaction: interaction as ExtendedInteraction,
		});
	} catch (e) {
		await LOGGER.error(e, `Failed to execute the interaction: ${interaction.commandName}`);

		await interaction.reply({
			content: `There was an error trying to execute the interaction: ${interaction.commandName}!`,
			ephemeral: true,
		});
	}

	LOGGER.info(`Interaction executed: ${interaction.commandName}`);
	return;
});
