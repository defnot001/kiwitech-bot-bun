import { ApplicationCommandOptionType } from 'discord.js';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';

type AnimalChoice = 'fox' | 'cat' | 'dog';

export default new Command({
	name: 'animal',
	description: 'Get random pictures from animals.',
	options: [
		{
			name: 'animal',
			description: 'Select an animal.',
			type: ApplicationCommandOptionType.String,
			choices: [
				{ name: 'Fox', value: 'fox' },
				{ name: 'Cat', value: 'cat' },
				{ name: 'Dog', value: 'dog' },
			],
			required: true,
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply();
		const animalChoice = args.getString('animal', true) as AnimalChoice;

		const handler = new AnimalCommandHandler({ interaction, client });
		if (!(await handler.init())) return;

		await handler.handleAnimal({ animalChoice });
	},
});

class AnimalCommandHandler extends BaseKiwiCommandHandler {
	public async handleAnimal(args: {
		animalChoice: AnimalChoice;
	}): Promise<void> {
		const apiURL = {
			fox: 'https://randomfox.ca/floof/',
			cat: 'https://api.thecatapi.com/v1/images/search',
			dog: 'https://api.thedogapi.com/v1/images/search',
		} as const;

		const url = apiURL[args.animalChoice];
		const jsonResponse = await this.fetchImage(url, args.animalChoice);

		if (!jsonResponse) {
			await this.interaction.editReply(`Failed to get a ${args.animalChoice} image.`);
		}

		switch (args.animalChoice) {
			case 'fox': {
				const foxResponse = jsonResponse as FoxResponseJSON;
				await this.interaction.editReply({ files: [foxResponse.image] });
				break;
			}
			case 'cat':
			case 'dog': {
				const catDogResponse = jsonResponse as DogCatResponseJSON;

				if (!catDogResponse[0]) {
					await this.interaction.editReply(`Failed to get a ${args.animalChoice} image.`);
					return;
				}

				await this.interaction.editReply({ files: [catDogResponse[0].url] });
				break;
			}
		}
	}

	private async fetchImage(url: string, animalChoice: AnimalChoice) {
		const response = await fetch(url).catch(async (e) => {
			await LOGGER.error(e, `Failed to fetch ${animalChoice} image.`);
			return null;
		});

		if (!response || !response.ok) {
			await this.interaction.editReply('Failed to get image.');
			return null;
		}

		return await this.parseJSON(response, animalChoice);
	}

	private async parseJSON(response: Response, animalChoice: AnimalChoice) {
		const jsonResponse = (await response.json().catch(async (e) => {
			await LOGGER.error(e, `Failed to parse JSON for ${animalChoice} image.`);
			return null;
		})) as FoxResponseJSON | DogCatResponseJSON | null;

		return jsonResponse;
	}
}

type DogCatResponseJSON = {
	id: string;
	url: string;
	width: number;
	height: number;
}[];

type FoxResponseJSON = {
	image: string;
	link: string;
};
