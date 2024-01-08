import { Client, Guild } from 'discord.js';
import { logErrorToBotLogChannel } from './loggers';

export async function getMojangUUID(
  username: string,
  guild: Guild,
  client: Client,
): Promise<{ id: string; name: string } | undefined> {
  try {
    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);

    if (!res.ok) {
      throw new Error(`${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as { id: string; name: string };

    return {
      id: formatMojangUUID(data.id),
      name: data.name,
    };
  } catch (err) {
    await logErrorToBotLogChannel({
      client,
      guild,
      message: `Failed to get the uuid for ${username}`,
      error: err,
    });

    return;
  }
}

export async function getMultipleUUIDs(usernames: string[]) {
  if (usernames.length < 1) {
    throw new Error('No usernames provided');
  }

  if (usernames.length > 10) {
    throw new Error('Too many usernames');
  }

  const response = await fetch('https://api.mojang.com/profiles/minecraft', {
    method: 'POST',
    body: JSON.stringify(usernames),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = (await response.json()) as Array<{ id: string; name: string }>;

  const mapped = data.map((user) => {
    return {
      id: formatMojangUUID(user.id),
      name: user.name,
    };
  });

  return mapped;
}

function formatMojangUUID(uuid: string) {
  return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(
    16,
    20,
  )}-${uuid.slice(20)}`;
}
