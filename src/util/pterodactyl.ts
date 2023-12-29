import { PteroClient } from 'ptero-client';
import { config, ServerChoice } from '../config';

export const ptero = new PteroClient({
  baseURL: config.ptero.url,
  apiKey: config.ptero.apiKey,
});

export async function getModFiles(serverChoice: ServerChoice) {
  const modFiles = await (
    await ptero.files.list(config.mcConfig[serverChoice].serverId, '/mods')
  ).filter((mod) => {
    return mod.is_file;
  });

  return modFiles;
}

async function getMods(serverChoice: ServerChoice) {
  const modFiles = await getModFiles(serverChoice);

  return {
    enabled: modFiles.filter((mod) => {
      return mod.name.endsWith('.jar');
    }),
    disabled: modFiles.filter((mod) => {
      return mod.name.endsWith('.disabled');
    }),
  };
}

export async function getModNames(serverChoice: ServerChoice) {
  const mods = await getMods(serverChoice);

  return {
    enabled: mods.enabled.map((mod) => mod.name.replace('.jar', '')),
    disabled: mods.disabled.map((mod) => mod.name.replace('.disabled', '')),
  };
}

export async function getServerState(serverChoice: ServerChoice) {
  const serverStats = await ptero.servers.getResourceUsage(
    config.mcConfig[serverChoice].serverId,
  );

  return serverStats.current_state;
}

export async function getServerProperties(serverChoice: ServerChoice) {
  const { serverId } = config.mcConfig[serverChoice];
  const fileContent = (await ptero.files.getContent(
    serverId,
    'server.properties',
  )) as string;

  return parseServerProperties(fileContent);
}

type ServerProperties = {
  seed: string | undefined;
  gamemode: 'survival' | 'creative' | undefined;
  motd: string | undefined;
  difficulty: 'hard' | 'normal' | 'easy' | 'peaceful' | undefined;
  maxPlayers: number | undefined;
  viewDistance: number | undefined;
  simulationDistance: number | undefined;
  hardcore: boolean | undefined;
  whitelist: boolean | undefined;
  levelType: string | undefined;
};

function parseServerProperties(propertiesText: string): ServerProperties {
  const lines = propertiesText.split('\n');
  const properties: Partial<ServerProperties> = {};

  for (const line of lines) {
    if (line.startsWith('#') || !line.includes('=')) {
      continue;
    }

    const [key, value] = line.split('=');

    switch (key) {
      case 'level-seed':
        properties.seed = value;
        break;
      case 'gamemode':
        properties.gamemode = value as 'survival' | 'creative' | undefined;
        break;
      case 'motd':
        properties.motd = value;
        break;
      case 'difficulty':
        properties.difficulty = value as
          | 'hard'
          | 'normal'
          | 'easy'
          | 'peaceful'
          | undefined;
        break;
      case 'max-players':
        properties.maxPlayers = parseInt(value!);
        break;
      case 'view-distance':
        properties.viewDistance = parseInt(value!);
        break;
      case 'simulation-distance':
        properties.simulationDistance = parseInt(value!);
        break;
      case 'hardcore':
        properties.hardcore = value === 'true';
        break;
      case 'white-list':
        properties.whitelist = value === 'true';
        break;
      case 'level-type':
        properties.levelType = value;
        break;
    }
  }

  return properties as ServerProperties;
}
