export async function getUUID(username: string) {
  const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);
  const data = (await response.json()) as { id: string; name: string };

  return {
    id: formatMojangUUID(data.id),
    name: data.name,
  };
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
