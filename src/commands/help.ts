import fs from 'node:fs';
import path from 'node:path';
import { ApplicationCommandOptionType } from 'discord.js';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { Command } from '../util/handler/classes/Command';

export const help = new Command({
	name: 'help',
	description: 'Get information on how to use things on SMP.',
	options: [
		{
			name: 'thing',
			description: 'The thing you want to get information about.',
			type: ApplicationCommandOptionType.String,
			required: true,
			choices: [
				{
					name: 'Mobswitches',
					value: 'Mobswitches',
				},
				{
					name: 'Bed Bot',
					value: 'BedBot',
				},
				{
					name: '10gt Raid Farm',
					value: '10gt Raid Farm',
				},
				{
					name: 'Mushroom Farms',
					value: 'Mushroom Farms',
				},
				{
					name: 'Building',
					value: 'Building',
				},
			],
		},
	],
	execute: async ({ interaction, args }) => {
		await interaction.deferReply();

		const choice = args.getString('thing', true);

		const helpDirPath = path.join(import.meta.dir, '../documents/help');
		const helpDocContent = fs.readFileSync(path.join(helpDirPath, `${choice}.md`), 'utf-8');

		const embed = new KoalaEmbedBuilder(interaction.user, {
			description: helpDocContent,
		});

		await interaction.editReply({ embeds: [embed] });
	},
});
