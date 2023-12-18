import { ApplicationCommandOptionType, AttachmentBuilder } from 'discord.js';
import { Command } from '../handler/classes/Command';
import { handleInteractionError } from '../util/loggers';

export default new Command({
  name: 'mcskin',
  description: 'Get the minecraft skin of a player.',
  options: [
    {
      name: 'type',
      description: 'The type of skin image you want to get.',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: 'avatar', value: '/avatars/' },
        { name: 'head', value: '/renders/head/' },
        { name: 'body', value: '/renders/body/' },
        { name: 'skin', value: '/skins/' },
      ],
    },
    {
      name: 'name',
      description: 'The minecraft name of the player you want the skin from.',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
  execute: async ({ interaction, args }) => {
    await interaction.deferReply();

    const imageType = args.getString('type', true) as
      | '/avatars/'
      | '/renders/head/'
      | '/renders/body/'
      | '/skins/';

    const name = args.getString('name');

    if (!name) {
      return interaction.editReply('Please provide a username!');
    }

    try {
      const uuidRes = await fetch(
        `https://api.mojang.com/users/profiles/minecraft/${name}`,
      );

      if (!uuidRes.ok) {
        await interaction.editReply(`Could not find the uuid for ${name}`);
        return;
      }

      const uuidJSONResponse = (await uuidRes.json()) as {
        name: string;
        id: string;
      };

      const url = `https://crafatar.com${imageType}${uuidJSONResponse.id}`;

      const skinRes = await fetch(url);

      if (!skinRes.ok) {
        await interaction.editReply(`Could not find the skin for ${name}`);
        return;
      }

      const arrBuffer = await skinRes.arrayBuffer();
      const buffer = Buffer.from(arrBuffer);

      const skinAttachment = new AttachmentBuilder(buffer, {
        name: `${name}.png`,
        description: `Minecraft Skin of the player ${name}`,
      });

      interaction.editReply({ files: [skinAttachment] });

      return;
    } catch (err) {
      handleInteractionError({
        interaction,
        err,
        message: `Failed to get the skin for ${name}!`,
      });

      return;
    }
  },
});
