import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ComponentType,
  GuildEmoji,
  TextChannel,
} from 'discord.js';
import { config, EmojiConfig } from '../config';
import { getServerChoices } from './helpers';
import { ExtendedInteraction } from './handler/types';

type ConfigEmojis = {
  [key in keyof EmojiConfig]: GuildEmoji;
};

const confirmButton = new ButtonBuilder({
  style: ButtonStyle.Success,
  label: 'Confirm',
  customId: 'confirm',
});

const cancelButton = new ButtonBuilder({
  style: ButtonStyle.Danger,
  label: 'Cancel',
  customId: 'cancel',
});

export const confirmCancelRow = new ActionRowBuilder<ButtonBuilder>({
  components: [confirmButton, cancelButton],
});

export const mcServerChoice = {
  name: 'server',
  description: 'The server you want to target.',
  type: 3,
  required: true,
  choices: [...getServerChoices()],
};

export function getButtonCollector(interaction: ExtendedInteraction) {
  const { channel } = interaction;
  if (!channel) return;

  if (channel instanceof TextChannel) {
    return channel.createMessageComponentCollector<ComponentType.Button>({
      filter: (i) => i.user.id === interaction.user.id,
      max: 1,
      time: 10000,
    });
  }

  return;
}

export const getEmojis = (client: Client) => {
  const emojis = {
    kiwi: client.emojis.cache.get(config.emoji.kiwi),
    owoKiwi: client.emojis.cache.get(config.emoji.owoKiwi),
    froghypers: client.emojis.cache.get(config.emoji.froghypers),
    frogYes: client.emojis.cache.get(config.emoji.frogYes),
    frogNo: client.emojis.cache.get(config.emoji.frogNo),
  };

  for (const emoji of Object.values(emojis)) {
    if (!emoji) {
      throw new Error('Missing emojis!');
    }
  }

  return emojis as ConfigEmojis;
};
