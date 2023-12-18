import { ApplicationCommandOptionType } from 'discord.js';
import { Command } from '../handler/classes/Command';
import { handleInteractionError } from '../util/loggers';

const apiURL = {
  fox: 'https://randomfox.ca/floof/',
  cat: 'https://api.thecatapi.com/v1/images/search',
  dog: 'https://api.thedogapi.com/v1/images/search',
} as const;

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
  execute: async ({ interaction, args }) => {
    try {
      await interaction.deferReply();

      const choice = args.getString('animal', true) as 'fox' | 'cat' | 'dog';
      const response = await fetch(apiURL[choice]);

      if (!response.ok) {
        await interaction.editReply(`Failed to get a ${choice} image.`);
      }

      if (choice === 'fox') {
        const jsonResponse = (await response.json()) as FoxResponseJSON;
        await interaction.editReply({ files: [jsonResponse.image] });
        return;
      }

      if (choice === 'dog' || choice === 'cat') {
        const jsonResponse = (await response.json()) as DogCatResponseJSON;
        const first = jsonResponse[0];

        if (!first) {
          await interaction.editReply(`Failed to get a ${choice} image.`);
          return;
        }

        await interaction.editReply({ files: [first.url] });
        return;
      }

      throw new Error();
    } catch (err) {
      handleInteractionError({
        interaction,
        err,
        message: `Something went wrong trying to get a picture of a ${args.getString(
          'animal',
          true,
        )}.`,
      });
    }
  },
});

type FoxResponseJSON = {
  image: string;
  link: string;
};

type DogCatResponseJSON = {
  id: string;
  url: string;
  width: number;
  height: number;
}[];
