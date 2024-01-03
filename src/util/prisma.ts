import { PrismaClient } from '@prisma/client';
import { type GuildMemberManager, type Snowflake, type User } from 'discord.js';
import { getUUID, getMultipleUUIDs } from './mojang';
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
) {
  if (minecraftIGNs.length === 0 || minecraftIGNs.length > 10) {
    throw new Error(`Expected between 1 and 10 minecraft igns, got ${minecraftIGNs.length}.`);
  }

  if (minecraftIGNs.length === 1) {
    const userdata = await getUUID(minecraftIGNs[0]!);

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
      const userdata = await getUUID(minecraftIGNs[0]!);

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

type ApplicationObjectInDatabase = {
  id: number;
  discordID: Snowflake | null;
  isOpen: boolean;
  content: ApplicationObject;
  createdAt: Date;
  updatedAt: Date;
};

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

export async function updateApplicationWithMember(applicationID: number, discordID: Snowflake) {
  const val = await prisma.application.update({
    where: {
      id: applicationID,
    },
    data: {
      discordID,
    },
  });

  return val as unknown as ApplicationObjectInDatabase;
}

export async function getApplicationFromID(applicationID: number) {
  const val = await prisma.application.findUnique({
    where: {
      id: applicationID,
    },
  });

  return val as unknown as ApplicationObjectInDatabase;
}

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
