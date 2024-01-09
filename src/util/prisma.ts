import { PrismaClient } from '@prisma/client';
import { Client, Guild, type GuildMemberManager, type Snowflake, type User } from 'discord.js';
import { getMojangUUID, getMultipleUUIDs } from './mojang';
import { ApplicationObject } from './application';
import { getMembersFromID } from './helpers';

const prisma = new PrismaClient();

type TodoOptions = {
  title: string;
  type: 'survival' | 'creative';
  createdBy: User;
  createdAt?: Date;
};

export async function getAllTodos() {
  return await prisma.todo.findMany();
}

export async function getTodoByType(type: 'survival' | 'creative') {
  return await prisma.todo.findMany({
    where: {
      type,
    },
  });
}

export async function addTodo({ title, type, createdBy, createdAt }: TodoOptions) {
  await prisma.todo.create({
    data: {
      title,
      type,
      createdBy: createdBy.username,
      createdAt: createdAt,
    },
  });
}

export async function updateTodo(oldTitle: string, newTitle: string) {
  await prisma.todo.updateMany({
    where: {
      title: oldTitle,
    },
    data: {
      title: newTitle,
    },
  });
}

export async function completeTodo(title: string) {
  await prisma.todo.deleteMany({
    where: {
      title,
    },
  });
}

export async function addMember(
  discordID: Snowflake,
  minecraftIGNs: string[],
  memberSince: Date,
  trialMember = false,
  guild: Guild,
  client: Client,
) {
  if (minecraftIGNs.length === 0 || minecraftIGNs.length > 10) {
    throw new Error(`Expected between 1 and 10 minecraft igns, got ${minecraftIGNs.length}.`);
  }

  if (minecraftIGNs.length === 1) {
    const userdata = await getMojangUUID(minecraftIGNs[0]!, guild, client);

    if (!userdata) {
      throw new Error(`Could not find the UUID for ${minecraftIGNs[0]!} from the Mojang API!`);
    }

    await prisma.mCMember.create({
      data: {
        discordID,
        memberSince,
        trialMember,
        minecraftData: {
          create: {
            username: userdata.name,
            uuid: userdata.id,
          },
        },
      },
    });
  }

  if (minecraftIGNs.length > 1) {
    const userdata = await getMultipleUUIDs(minecraftIGNs);

    await prisma.mCMember.create({
      data: {
        discordID,
        memberSince,
        trialMember,
        minecraftData: {
          createMany: {
            data: userdata.map((data) => {
              return {
                username: data.name,
                uuid: data.id,
              };
            }),
          },
        },
      },
    });
  }
}

export async function updateMember(
  discordID: Snowflake,
  guild: Guild,
  client: Client,
  minecraftIGNs?: string[],
  trialMember?: boolean,
  memberSince?: Date,
) {
  const updateData: any = {};

  if (trialMember !== undefined) {
    updateData.trialMember = trialMember;
  }

  if (memberSince) {
    updateData.memberSince = memberSince;
  }

  if (minecraftIGNs && minecraftIGNs.length > 0) {
    if (minecraftIGNs.length > 10) {
      throw new Error(`Expected between 1 and 10 minecraft igns, got ${minecraftIGNs.length}.`);
    }

    if (minecraftIGNs.length === 1) {
      const userdata = await getMojangUUID(minecraftIGNs[0]!, guild, client);

      if (!userdata) {
        throw new Error(`Could not find the UUID for ${minecraftIGNs[0]!} from the Mojang API!`);
      }

      updateData.minecraftData = {
        deleteMany: {},
        create: {
          username: userdata.name,
          uuid: userdata.id,
        },
      };
    }

    if (minecraftIGNs.length > 1) {
      const userdata = await getMultipleUUIDs(minecraftIGNs);

      updateData.minecraftData = {
        deleteMany: {},
        createMany: {
          data: userdata.map((data) => {
            return {
              username: data.name,
              uuid: data.id,
            };
          }),
        },
      };
    }
  }

  await prisma.mCMember.update({
    where: {
      discordID,
    },
    data: updateData,
  });
}

export async function removeMember(discordID: Snowflake) {
  await prisma.mCMember.delete({
    where: {
      discordID,
    },
  });
}

export async function getMemberNames(manager: GuildMemberManager) {
  const members = await prisma.mCMember.findMany({
    orderBy: [
      {
        memberSince: 'asc',
      },
      {
        discordID: 'asc',
      },
    ],
  });

  const memberCollection = await getMembersFromID(
    members.map((member) => member.discordID),
    manager,
  );

  const sortedMembers = memberCollection
    .map((member) => {
      const mcMember = members.find((m) => m.discordID === member.id);
      return {
        discordID: member.id,
        username: member.user.username,
        memberSince: mcMember?.memberSince,
      };
    })
    .sort((a, b) => {
      if (a.memberSince && b.memberSince) {
        const dateComparison = a.memberSince.getTime() - b.memberSince.getTime();
        if (dateComparison !== 0) {
          return dateComparison;
        }
      }
      return a.username.localeCompare(b.username);
    });

  return sortedMembers;
}

export async function getMemberFromID(id: Snowflake) {
  const member = await prisma.mCMember.findUnique({
    where: {
      discordID: id,
    },
    include: {
      minecraftData: true,
    },
  });

  if (!member) {
    throw new Error(`Member with ID ${id} not found.`);
  }

  return member;
}

export async function isMemberInDatabase(id: Snowflake) {
  try {
    await prisma.mCMember.findUnique({
      where: {
        discordID: id,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export type ApplicationObjectInDatabase = {
  id: number;
  discordID: Snowflake | null;
  isOpen: boolean;
  content: ApplicationObject;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Store an application in the database. If the discordID is provided, it will be linked to the User's ID.
 * @param {ApplicationObject} application The application.
 * @param {boolean} isOpen Whether the application is open.
 * @param {Snowflake} discordID The discord ID of the user. Optional.
 * @returns {Promise<ApplicationObjectInDatabase>} The stored application.
 */
export async function storeApplication(
  application: ApplicationObject,
  isOpen: boolean,
  discordID?: Snowflake,
) {
  const val = await prisma.application.create({
    data: {
      discordID,
      isOpen,
      content: application,
    },
  });

  return val as unknown as ApplicationObjectInDatabase;
}

/**
 * Update an application in the database. This will also set the discordID of the application to the user's ID.
 * @param {number} applicationID The ID of the application.
 * @param {User} user The user that updated the application.
 * @param {ApplicationObject} application The new application.
 * @param {Guild} guild The guild the application was updated in.
 * @param {Client} client The Discord client.
 * @returns {Promise<ApplicationObjectInDatabase>} The updated application.
 *
 * This function throws an error if the application does not exist in the database.
 */
export async function updateApplication(
  applicationID: number,
  user: User,
  application: ApplicationObject,
): Promise<ApplicationObjectInDatabase> {
  return (await prisma.application.update({
    where: {
      id: applicationID,
    },
    data: {
      content: application,
      discordID: user.id,
    },
  })) as unknown as ApplicationObjectInDatabase;
}

/**
 * Get an application from the database.
 * @param {number} applicationID The ID of the application.
 * @returns {Promise<ApplicationObjectInDatabase | null>} The application or null if it was not found.
 */
export async function getApplicationFromID(applicationID: number) {
  const val = await prisma.application.findUnique({
    where: {
      id: applicationID,
    },
  });

  return val as unknown as ApplicationObjectInDatabase | null;
}

/**
 * Get the latest application from a member.
 * @param {Snowflake} discordID The discord ID of the member.
 * @returns {Promise<ApplicationObjectInDatabase>} The latest application.
 * @throws {Error} If the member does not exist in the database or if the member has no applications.
 */
export async function getLatestApplicationFromMember(discordID: Snowflake) {
  const val = await prisma.application.findFirst({
    where: {
      discordID,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return val as unknown as ApplicationObjectInDatabase;
}

/**
 * Get the latest applications from the database.
 * @param {number} amount The amount of applications to get. Defaults to 25.
 * @returns {Promise<ApplicationObjectInDatabase[]>} The latest applications.
 */
export async function getLatestApplications(amount = 20) {
  const val = await prisma.application.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: amount,
  });

  return val as unknown as ApplicationObjectInDatabase[];
}

/**
 * Get the latest open applications from the database.
 * @param {number} amount The amount of applications to get. Defaults to 25.
 * @returns {Promise<ApplicationObjectInDatabase[]>} The latest open applications. Returns an empty array if there are no open applications.
 */
export async function getLatestOpenApplications(amount = 20) {
  const val = await prisma.application.findMany({
    where: {
      isOpen: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: amount,
  });

  return val as unknown as ApplicationObjectInDatabase[];
}

/**
 * Closes an application in the database.
 * @param {number} applicationID The ID of the application.
 * @returns {Promise<void>}
 */
export async function closeApplication(applicationID: number) {
  await prisma.application.update({
    where: {
      id: applicationID,
    },
    data: {
      isOpen: false,
    },
  });
}

/**
 * Opens an application in the database.
 * @param {number} applicationID The ID of the application.
 * @returns {Promise<void>}
 */
export async function openApplication(applicationID: number) {
  await prisma.application.update({
    where: {
      id: applicationID,
    },
    data: {
      isOpen: true,
    },
  });
}

/**
 * Delete an application from the database.
 * @param {number} applicationID The ID of the application.
 * @returns {Promise<void>}
 * @throws {Error} If the application does not exist in the database.
 */
export async function deleteApplication(applicationID: number) {
  await prisma.application.delete({
    where: {
      id: applicationID,
    },
  });
}
