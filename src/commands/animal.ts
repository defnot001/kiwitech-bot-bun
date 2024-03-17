import { ApplicationCommandOptionType, Client, Guild } from 'discord.js';
import { Command } from '../util/handler/classes/Command';
import { handleInteractionError, logErrorToBotLogChannel } from '../util/loggers';
import { ERROR_MESSAGES } from '../util/constants';

type AnimalChoices = 'fox' | 'cat' | 'dog';

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

      const choice = args.getString('animal', true) as AnimalChoices;

      if (!interaction.guild) {
        throw new Error(ERROR_MESSAGES.ONLY_GUILD);
      }

      if (choice === 'fox') {
        const image = await getFoxImage(interaction.client, interaction.guild);

        if (!image) {
          await interaction.editReply('Failed to get a fox image.');
          return;
        }

        await interaction.editReply({ files: [image] });
        return;
      }

      if (choice === 'dog' || choice === 'cat') {
        const image = await getCatOrDogImage(interaction.client, interaction.guild, choice);

        if (!image) {
          await interaction.editReply(`Failed to get a ${choice} image.`);
          return;
        }

        await interaction.editReply({ files: [image] });
        return;
      }

      throw new Error(`Invalid argument for \`/animal\`: ${choice}`);
    } catch (err) {
      await handleInteractionError({
        interaction,
        err,
        message: `Something went wrong trying to get a picture of a ${args.getString(
          'animal',
          true,
        )}.`,
      });

      return;
    }
  },
});

/**
 * Get a random fox image from the `randomfox.ca` API.
 * @param {Client} client The Discord client.
 * @param {Guild} guild The guild the command was executed in.
 * @returns {string} The URL of the fox image or `undefined` if an error occurred.
 *
 * This function never throws an error. If an error occurs, it will be logged to the bot log channel.
 */
async function getFoxImage(client: Client, guild: Guild): Promise<string | undefined> {
  type FoxResponseJSON = {
    image: string;
    link: string;
  };

  try {
    const response = await fetch('https://randomfox.ca/floof/');

    if (!response.ok) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    const jsonResponse = (await response.json()) as FoxResponseJSON;
    return jsonResponse.image;
  } catch (err) {
    await logErrorToBotLogChannel({
      client,
      guild,
      message: 'Failed to get a fox image.',
      error: err,
    });

    return;
  }
}

/**
 * Get a random cat or dog image from the `thecatapi.com` or `thedogapi.com` API.
 * @param {Client} client The Discord client.
 * @param {Guild} guild The guild the command was executed in.
 * @param {'cat' | 'dog'} choice The animal to get an image of.
 * @returns {string} The URL of the cat or dog image or `undefined` if an error occurred.
 *
 * This function never throws an error. If an error occurs, it will be logged to the bot log channel.
 */
async function getCatOrDogImage(client: Client, guild: Guild, choice: 'cat' | 'dog') {
  const apiURL = {
    cat: 'https://api.thecatapi.com/v1/images/search',
    dog: 'https://api.thedogapi.com/v1/images/search',
  } as const;

  type DogCatResponseJSON = {
    id: string;
    url: string;
    width: number;
    height: number;
  }[];

  try {
    const response = await fetch(apiURL[choice]);

    if (!response.ok) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    const jsonResponse = (await response.json()) as DogCatResponseJSON;

    if (!jsonResponse[0]) {
      throw new Error('No image found in API response');
    }

    return jsonResponse[0].url;
  } catch (err) {
    await logErrorToBotLogChannel({
      client,
      guild,
      message: `Failed to get a ${choice} image.`,
      error: err,
    });

    return;
  }
}
