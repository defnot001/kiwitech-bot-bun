import { ApplicationCommandOptionType } from 'discord.js';
import type { PterodactylFile } from 'ptero-client';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { type ServerChoice, config } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { mcServerChoice } from '../util/components';
import { Command } from '../util/handler/classes/Command';
import type { ExtendedClient } from '../util/handler/classes/ExtendedClient';
import type { ExtendedInteraction } from '../util/handler/types';
import { LOGGER } from '../util/logger';
import { getModFiles, getModNames, ptero } from '../util/pterodactyl';

const modnameOption = {
	name: 'modname',
	description: 'The name of the mod.',
	type: 3,
	required: true,
	autocomplete: true,
};

export const mods = new Command({
	name: 'mods',
	description: 'Lists and enables/disables mods.',
	options: [
		{
			name: 'list',
			description: 'Lists all enabled and disabled mods.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [mcServerChoice],
		},
		{
			name: 'enable',
			description: 'Enables a mod on the specified server.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [mcServerChoice, modnameOption],
		},
		{
			name: 'disable',
			description: 'Disables a mod on the specified server.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [mcServerChoice, modnameOption],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();

		const handler = new ModsCommandHandler({
			interaction,
			client,
			serverChoice: args.getString('server') as ServerChoice,
		});

		if (!(await handler.init())) return;

		const subcommand = args.getSubcommand() as 'list' | 'enable' | 'disable';

		if (subcommand === 'list') {
			await handler.handleList();
			return;
		}

		const modName = args.getString('modname');

		if (!modName) {
			await interaction.editReply('Please provide a valid mod name!');
			return;
		}

		if (subcommand === 'enable') {
			await handler.handleEnable({ modName });
			return;
		}

		if (subcommand === 'disable') {
			await handler.handleDisable({ modNames: modName });
			return;
		}
	},
});

class ModsCommandHandler extends BaseKiwiCommandHandler {
	private readonly serverChoice: ServerChoice;

	constructor(options: {
		interaction: ExtendedInteraction;
		client: ExtendedClient;
		serverChoice: ServerChoice;
	}) {
		super(options);
		this.serverChoice = options.serverChoice;
	}

	public async handleList() {
		const modNames = await getModNames(this.serverChoice);

		if (!modNames) {
			await this.interaction.editReply('An error occurred while trying to get the mod names!');
			return;
		}

		if (modNames.disabled.length === 0 && modNames.enabled.length === 0) {
			await this.interaction.editReply(
				`There are no mods in the mods folder for ${this.serverChoice}!`,
			);
			return;
		}

		const modListEmbed = new KoalaEmbedBuilder(this.interaction.user, {
			title: `Modlist for ${this.serverChoice}`,
		});

		if (modNames.enabled.length > 0) {
			modListEmbed.addFields({
				name: 'Enabled Mods',
				value: modNames.enabled.join('\n'),
			});
		}

		if (modNames.disabled.length > 0) {
			modListEmbed.addFields({
				name: 'Disabled Mods',
				value: modNames.disabled.join('\n'),
			});
		}

		await this.interaction.editReply({ embeds: [modListEmbed] });
	}
	public async handleEnable(args: { modName: string }) {
		const targetMod = await this.getTargetMod(args.modName);
		if (!targetMod) return;

		if (targetMod.name.endsWith('.jar')) {
			await this.interaction.editReply(`Mod: ${targetMod.name} is already enabled!`);
			return;
		}

		try {
			await ptero.files.rename(config.mcConfig[this.serverChoice].serverId, {
				from: targetMod.name,
				to: targetMod.name.replace('.disabled', '.jar'),
				directory: '/mods',
			});
		} catch (e) {
			await LOGGER.error(e, `Failed to enable ${targetMod.name} on ${this.serverChoice}`);
			await this.interaction.editReply('An error occurred while trying to enable the mod!');
			return;
		}

		await this.interaction.editReply(
			`Successfully enabled ${targetMod.name.replace('.disabled', '')} on ${this.serverChoice}!`,
		);
	}
	public async handleDisable(args: { modNames: string }) {
		const targetMod = await this.getTargetMod(args.modNames);
		if (!targetMod) return;

		if (targetMod.name.endsWith('.disabled')) {
			await this.interaction.editReply(`Mod: ${targetMod.name} is already disabled!`);
			return;
		}

		try {
			await ptero.files.rename(config.mcConfig[this.serverChoice].serverId, {
				from: targetMod.name,
				to: targetMod.name.replace('.jar', '.disabled'),
				directory: '/mods',
			});
		} catch (e) {
			await LOGGER.error(e, `Failed to disable ${targetMod.name} on ${this.serverChoice}`);
			await this.interaction.editReply('An error occurred while trying to disable the mod!');
			return;
		}

		await this.interaction.editReply(
			`Successfully disabled ${targetMod.name.replace('.jar', '')} on ${this.serverChoice}!`,
		);
	}

	/**
	 * Gets the target mod from the command argument from the target server.
	 * Returns the file or null if the file is not found.
	 * @sideeffect Edits the interaction reply if an error occurs.
	 */
	private async getTargetMod(modName: string): Promise<PterodactylFile | null> {
		if (!modName.trim()) {
			await this.interaction.editReply('Please provide a valid mod name!');
			return null;
		}

		const modFiles = await getModFiles(this.serverChoice);

		if (!modFiles) {
			await this.interaction.editReply(
				`An error occurred while trying to get the mod files for ${this.serverChoice}!`,
			);
			return null;
		}

		const targetMods = modFiles.filter(
			(mod) => mod.name === `${modName}.jar` || mod.name === `${modName}.disabled`,
		);

		if (targetMods.length === 0) {
			await this.interaction.editReply(`Cannot find mod: ${modName}!`);
			return null;
		}

		if (targetMods.length > 1) {
			await this.interaction.editReply(`Found multiple mods with the name: ${modName}!`);
			return null;
		}

		if (!targetMods[0]) {
			await this.interaction.editReply('An error occurred while trying to get the target mod!');
			return null;
		}

		return targetMods[0];
	}
}
