import { type ApplicationCommandDataResolvable, Client, Collection } from 'discord.js';
import { LOGGER } from '../../logger';
import type { ClientStartOptions, CommandOptions, RegisterCommandOptions } from '../types';

import { animal } from '../../../commands/animal';
import { application } from '../../../commands/application';
import { backup } from '../../../commands/backup';
import { help } from '../../../commands/help';
import { info } from '../../../commands/info';
import { mcserver } from '../../../commands/mcserver';
import { mcskin } from '../../../commands/mcskin';
import { member } from '../../../commands/member';
import { mirror } from '../../../commands/mirror';
import { mods } from '../../../commands/mods';
import { rcon } from '../../../commands/rcon';
import { roletoggle } from '../../../commands/roletoggle';
import { scoreboard } from '../../../commands/scoreboard';
import { status } from '../../../commands/status';
import { todo } from '../../../commands/todo';
import { trialmember } from '../../../commands/trialmember';
import { waypoint } from '../../../commands/waypoint';
// import { whitelist } from '../../../commands/whitelist';

import { application as applicationEvent } from '../../../events/application';
import { autocomplete } from '../../../events/autocomplete';
import { guildBanAdd } from '../../../events/guildBanAdd';
import { guildBanRemove } from '../../../events/guildBanRemove';
import { guildMemberAdd } from '../../../events/guildMemberAdd';
import { guildMemberRemove } from '../../../events/guildMemberRemove';
import { interactionCreate } from '../../../events/interactionCreate';
import { ready } from '../../../events/ready';

const COMMANDS = [
	animal,
	application,
	backup,
	help,
	info,
	mcserver,
	mcskin,
	member,
	mirror,
	mods,
	roletoggle,
	rcon,
	scoreboard,
	status,
	todo,
	trialmember,
	waypoint,
	// whitelist,
];

const EVENTS = [
	applicationEvent,
	autocomplete,
	guildBanAdd,
	guildBanRemove,
	guildMemberAdd,
	guildMemberRemove,
	interactionCreate,
	ready,
];

export class ExtendedClient extends Client {
	public commands: Collection<string, CommandOptions> = new Collection();

	public async start(options: ClientStartOptions) {
		const { botToken, guildID, globalCommands, registerCommands } = options;

		await this.setModules();

		if (registerCommands) {
			const slashCommands: ApplicationCommandDataResolvable[] = this.commands.map(
				(command) => command,
			);

			this.once('ready', () => {
				if (globalCommands) {
					this.registerCommands({
						commands: slashCommands,
					});
				} else {
					this.registerCommands({
						guildID,
						commands: slashCommands,
					});
				}
			});
		}

		await this.login(botToken);
	}

	/**
	 * Removes all the commands from the guild or globally.
	 * If there is no `guildID` being passed, it will remove the global application commands.
	 */
	public async removeCommands(guildId?: string) {
		if (guildId) {
			const guild = this.guilds.cache.get(guildId);

			if (!guild) {
				throw new Error('Cannot find the guild to remove the commands from!');
			}

			await guild.commands.set([]);

			LOGGER.info(`Successfully removed commands from ${guild.name}.`);
		} else {
			if (!this.application) {
				throw new Error('Cannot find the application to remove the commands from!');
			}

			await this.application.commands.set([]);

			LOGGER.info('Successfully removed all commands.');
		}
	}

	private async registerCommands(options: RegisterCommandOptions) {
		const { commands, guildID } = options;

		if (guildID) {
			const guild = this.guilds.cache.get(guildID);

			if (!guild) {
				throw new Error('Cannot find the guild to register the commands to');
			}

			await guild.commands.set(commands);

			LOGGER.info(`Successfully registered ${commands.length} commands to ${guild.name}.`);
		} else {
			if (!this.application) {
				throw new Error('Cannot find the application to register the commands to');
			}

			await this.application.commands.set(commands);

			LOGGER.info(`Successfully registered ${commands.length} global commands.`);
		}
	}

	private async setModules() {
		for (const command of COMMANDS) {
			if (!command.name) {
				throw new Error('Command is missing the name property.');
			}

			this.commands.set(command.name, command);
		}

		for (const event of EVENTS) {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			this.on(event.name, event.execute as any);
		}
	}
}
