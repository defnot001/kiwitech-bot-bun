import { ApplicationCommandOptionType } from 'discord.js';
import { Command } from '../handler/classes/Command';
import { KoalaEmbedBuilder } from '../classes/KoalaEmbedBuilder';
import { config, ServerChoice } from '../config';
import { getServerChoices } from '../util/helpers';
import { handleInteractionError } from '../util/loggers';
import RCONUtil from '../util/rcon';
import { getServerState } from '../util/pterodactyl';
import MCStatus from '../util/mcstatus';
import { ERROR_MESSAGES } from '../util/constants';

export default new Command({
  name: 'status',
  description: 'Get the status of a Minecraft Server.',
  options: [
    {
      name: 'server',
      description: 'Choose a server.',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [...getServerChoices()],
    },
  ],
  execute: async ({ interaction, args }) => {
    await interaction.deferReply();

    const server = args.getString('server', true) as ServerChoice;

    if (!server) {
      return interaction.editReply('Please specify a server!');
    }

    if (!interaction.guild) {
      return interaction.reply(ERROR_MESSAGES.ONLY_GUILD);
    }

    try {
      const serverState = await getServerState(server);

      if (serverState !== 'running') {
        return interaction.editReply(`Server is currently ${serverState}!`);
      }

      const status = await MCStatus.queryFull(server);
      const serverMetrics = await getServerMetrics(server);

      const playerlist =
        serverMetrics.players.playerList.join('\n') || 'There is currently nobody online.';

      const statusEmbed = new KoalaEmbedBuilder(interaction.user, {
        title: `${interaction.guild.name} ${server.toUpperCase()}`,
        color: config.embedColors.green,
        fields: [
          { name: 'Status', value: 'Online' },
          { name: 'Version', value: `${status.version?.name_clean}` },
          {
            name: 'Performance',
            value: `**${serverMetrics.performance.mspt}** MSPT | **${serverMetrics.performance.tps}** TPS`,
          },
          {
            name: 'Hostile Mobcaps',
            value: `Overworld: ${serverMetrics.mobcaps.overworld}\nThe Nether: ${serverMetrics.mobcaps.the_nether}\nThe End: ${serverMetrics.mobcaps.the_end}`,
          },
          {
            name: 'Playercount',
            value: `online: **${serverMetrics.players.count}** | max: **${serverMetrics.players.max}**`,
          },
          {
            name: 'Playerlist',
            value: playerlist,
          },
        ],
      });

      const { mspt } = serverMetrics.performance;

      if (mspt >= 30 && mspt < 40) {
        statusEmbed.setColor(config.embedColors.yellow);
      } else if (mspt >= 40 && mspt < 50) {
        statusEmbed.setColor(config.embedColors.orange);
      } else if (mspt >= 50) {
        statusEmbed.setColor(config.embedColors.red);
      }

      const guildIcon = interaction.guild.iconURL();

      if (guildIcon) {
        statusEmbed.setThumbnail(guildIcon);
      }

      return interaction.editReply({ embeds: [statusEmbed] });
    } catch (err) {
      return handleInteractionError({
        interaction,
        err,
        message: `There was an error trying to get the status of ${interaction.guild.name} ${server}`,
      });
    }
  },
});

const MINECRAFT_DIMENSIONS = ['overworld', 'the_nether', 'the_end'] as const;
type MinecraftDimension = (typeof MINECRAFT_DIMENSIONS)[number];
type DimensionMobcaps = {
  [K in MinecraftDimension]: string;
};
type ServerPerformance = {
  mspt: number;
  tps: number;
};
type OnlinePlayers = {
  count: number;
  max: number;
  playerList: string[];
};
type ServerMetrics = {
  mobcaps: DimensionMobcaps;
  performance: ServerPerformance;
  players: OnlinePlayers;
};

async function getServerMetrics(server: ServerChoice): Promise<ServerMetrics> {
  const commands: string[] = [];

  for (const dimension of MINECRAFT_DIMENSIONS) {
    commands.push(`execute in minecraft:${dimension} run script run get_mob_counts('monster')`);
  }

  commands.push(`script run reduce(system_info('server_last_tick_times'), _a+_, 0)/100`);

  commands.push(`list`);

  const response = await RCONUtil.runMultipleCommands(server, commands);

  const listResponse = response.pop();
  const performanceResponse = response.pop();
  const mobcapResponse = response;

  if (!listResponse) {
    throw new Error(`Failed to query the playerlist for ${server}`);
  }

  if (!performanceResponse) {
    throw new Error(`Failed to query server performance for ${server}`);
  }

  return {
    mobcaps: getMobcaps(mobcapResponse),
    performance: getPerformance(performanceResponse),
    players: getOnlinePlayers(listResponse),
  };
}

function getPerformance(rconResponse: string): ServerPerformance {
  const splitNumbers = rconResponse.split(' ')[2];

  if (!splitNumbers) {
    throw new Error('Failed to parse server data');
  }

  const mspt = Math.round(parseFloat(splitNumbers) * 100) / 100;

  let tps: number;

  if (mspt <= 50) {
    tps = 20;
  } else {
    tps = Math.round((1000 / mspt) * 10) / 10;
  }

  return { mspt, tps };
}

function getMobcaps(rconResponses: string[]): DimensionMobcaps {
  if (rconResponses.length !== 3) {
    throw new Error('Failed to parse mobcaps because of unexpected server response data');
  }

  const replaced = [];

  for (const res of rconResponses) {
    replaced.push(res.replace(/^.{0,3}| \(.*\)|[[\]]/g, '').replace(/, /g, ' | '));
  }

  return {
    overworld: replaced[0]!,
    the_nether: replaced[1]!,
    the_end: replaced[2]!,
  };
}

function getOnlinePlayers(listResponse: string): OnlinePlayers {
  const splitWords = listResponse.split(' ');
  const count = parseInt(splitWords[2]!);
  const max = parseInt(splitWords[7]!);
  let playerList: string[] = [];

  if (count > 0) {
    playerList = listResponse.split(': ')[1]?.split(', ')!;
  }

  return {
    count,
    max,
    playerList,
  };
}
