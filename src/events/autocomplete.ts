import type { AutocompleteFocusedOption, AutocompleteInteraction } from 'discord.js';
import { client } from '..';
import type { ScoreboardChoiceValue } from '../commands/scoreboard';
import { type ServerChoice, config } from '../config';
import TodoModelController from '../database/model/todoModelController';
import { DiscordEvent } from '../util/handler/classes/Event';
import allScboreboards from '../util/scoreboards_1.19.2';

import { LOGGER } from '../util/logger';
import { getModNames, ptero } from '../util/pterodactyl';
import { getWhitelistedPlayers } from '../commands/whitelist';
import { fetchWaypoints } from '../commands/waypoint';

export const autocomplete = new DiscordEvent('interactionCreate', async (interaction) => {
	if (!interaction.isAutocomplete()) {
		return;
	}

	const guild = interaction.guild;

	if (!guild) {
		await LOGGER.warn("No guild found for autocomplete interaction, can't proceed.");
		return;
	}

	const command = client.commands.get(interaction.commandName);

	if (!command) {
		await LOGGER.error(new Error(`No command matching ${interaction.commandName} was found`));
		return;
	}

	const focused = interaction.options.getFocused(true);

	if (interaction.commandName === 'scoreboard') {
		await handleScoreboardAutocomplete({
			interaction,
			focused,
		});

		return;
	}

	if (interaction.commandName === 'todo') {
		await handleTodoAutocomplete({
			interaction,
			focused,
		});

		return;
	}

	if (interaction.commandName === 'whitelist') {
		await handleWhitelistAutocomplete({
			interaction,
			focused,
		});

		return;
	}

	if (interaction.commandName === 'waypoint') {
		await handleWaypointAutocomplete({
			interaction,
			focused,
		});

		return;
	}

	if (interaction.commandName === 'mods') {
		await handleModAutocomplete({
			interaction,
			focused,
		});

		return;
	}

	if (interaction.commandName === 'backup') {
		await handleBackupAutocomplete({
			interaction,
			focused,
		});

		return;
	}
});

async function handleScoreboardAutocomplete(options: {
	interaction: AutocompleteInteraction;
	focused: AutocompleteFocusedOption;
}) {
	try {
		const { interaction, focused } = options;

		const action = interaction.options.getString('action') as ScoreboardChoiceValue | null;

		if (focused.name === 'playername') {
			const whitelistNames = await getWhitelistedPlayers('smp');

			if (!whitelistNames) {
				return;
			}

			await interaction.respond(mapChoices(whitelistNames, focused));
			return;
		}

		if (focused.name === 'item') {
			if (action === 'extra') {
				await interaction.respond(mapChoices(['digs', 'bedrock_removed'], focused));
				return;
			}

			if (action !== null) {
				const targetObjectives = allScboreboards
					.filter((obj) => obj.stat.startsWith(action))
					.map((item) => item.stat.replace(`${action}-`, ''));

				await interaction.respond(mapChoices(targetObjectives, focused));
			}
		}
	} catch (e) {
		await LOGGER.error(e, 'Failed to autocomplete for scoreboard command');
	}
}

async function handleTodoAutocomplete(options: {
	interaction: AutocompleteInteraction;
	focused: AutocompleteFocusedOption;
}) {
	try {
		const { interaction, focused } = options;

		if (interaction.options.getSubcommand() === 'add') {
			return;
		}

		const todoList = await TodoModelController.getAllTodos();
		const todoListChoice = todoList.map((todo) => todo.title);

		await interaction.respond(mapChoices(todoListChoice, focused));
	} catch (e) {
		await LOGGER.error(e, 'Failed to autocomplete for todo command');
	}
}

async function handleWhitelistAutocomplete(options: {
	interaction: AutocompleteInteraction;
	focused: AutocompleteFocusedOption;
}) {
	try {
		const { interaction, focused } = options;

		const totalWhitelist = new Set<string>();

		for (const server in config.mcConfig) {
			if (server === 'snapshots') {
				continue;
			}

			const whitelist = await getWhitelistedPlayers(server as ServerChoice);

			if (!whitelist) {
				return;
			}

			for (const name of whitelist) {
				totalWhitelist.add(name);
			}
		}

		const whitelistNames = [...totalWhitelist].sort((a, b) =>
			a.toLowerCase().localeCompare(b.toLowerCase()),
		);

		await interaction.respond(mapChoices(whitelistNames, focused));
	} catch (e) {
		await LOGGER.error(e, 'Failed to autocomplete for whitelist command');
	}
}

async function handleWaypointAutocomplete(options: {
	interaction: AutocompleteInteraction;
	focused: AutocompleteFocusedOption;
}) {
	try {
		const { interaction, focused } = options;

		const allWaypointNames = new Set<string>();

		const waypoints = await fetchWaypoints();

		if (!waypoints) {
			return;
		}

		for (const waypoint of waypoints) {
			allWaypointNames.add(waypoint.name);
		}

		const sortedWaypointNames = [...allWaypointNames].sort((a, b) =>
			a.toLowerCase().localeCompare(b.toLowerCase()),
		);

		await interaction.respond(mapChoices(sortedWaypointNames, focused));
	} catch (e) {
		await LOGGER.error(e, 'Failed to autocomplete for waypoint command');
	}
}

async function handleModAutocomplete(options: {
	interaction: AutocompleteInteraction;
	focused: AutocompleteFocusedOption;
}) {
	try {
		const { interaction, focused } = options;
		const serverChoice = interaction.options.getString('server') as ServerChoice | null;

		if (!serverChoice) {
			return;
		}

		const modNames = await getModNames(serverChoice);

		if (!modNames) {
			return;
		}

		const modNamesChoice =
			interaction.options.getSubcommand() === 'enable' ? modNames.disabled : modNames.enabled;

		await interaction.respond(mapChoices(modNamesChoice, focused));
	} catch (e) {
		await LOGGER.error(e, 'Failed to autocomplete for mods command');
	}
}

async function handleBackupAutocomplete(options: {
	interaction: AutocompleteInteraction;
	focused: AutocompleteFocusedOption;
}) {
	try {
		const { interaction, focused } = options;
		const serverChoice = interaction.options.getString('server') as ServerChoice | null;

		if (!serverChoice) {
			return;
		}

		const backupListResponse = await ptero.backups
			.list(config.mcConfig[serverChoice].serverId)
			.catch((e) => {
				LOGGER.error(e, `Failed to fetch backups for server ${serverChoice}`);
				return null;
			});

		if (!backupListResponse) {
			return;
		}

		const backupNames = backupListResponse.data.reverse().map((backup) => backup.name);

		await interaction.respond(mapChoices(backupNames, focused));
	} catch (e) {
		await LOGGER.error(e, 'Failed to autocomplete for backup command');
	}
}

function mapChoices(choices: string[], focused: AutocompleteFocusedOption) {
	return choices
		.filter((choice) => choice.startsWith(focused.value))
		.slice(0, 25)
		.map((choice) => ({ name: choice, value: choice }));
}
