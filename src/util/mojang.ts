export default abstract class MojangAPI {
  static async getUUID(username: string) {
    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);

    if (!res.ok) {
      throw new Error(`${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as { id: string; name: string };

    return {
      id: this.formatMojangUUID(data.id),
      name: data.name,
    };
  }

  static async getUUIDs(usernames: string[]) {
    if (usernames.length > 10) {
      throw new Error('Too many usernames');
    }

    const response = await fetch(
      'https://api.minecraftservices.com/minecraft/profile/lookup/bulk/byname',
      {
        method: 'POST',
        body: JSON.stringify(usernames),
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    const data = (await response.json()) as Array<{ id: string; name: string }>;

    return data.map((user) => {
      return {
        id: this.formatMojangUUID(user.id),
        name: user.name,
      };
    });
  }

  static async getProfile(uuid: string) {
    const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);

    if (!res.ok) {
      throw new Error(`${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as {
      id: string;
      name: string;
      properties: Array<{ name: string; value: string }>;
    };

    return {
      id: this.formatMojangUUID(data.id),
      name: data.name,
      properties: data.properties,
    };
  }

  private static formatMojangUUID(uuid: string) {
    return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(
      16,
      20,
    )}-${uuid.slice(20)}`;
  }
}
