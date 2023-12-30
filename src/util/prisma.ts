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
  minecraftIGNs: string[],
  trialMember = false,
  memberSince: Date | undefined,
) {
  if (minecraftIGNs.length === 0 || minecraftIGNs.length > 10) {
    throw new Error(`Expected between 1 and 10 minecraft igns, got ${minecraftIGNs.length}.`);
  }

  if (minecraftIGNs.length === 1) {
    const userdata = await getUUID(minecraftIGNs[0]!);

    await prisma.mCMember.update({
      where: {
        discordID,
      },
      data: {
        trialMember,
        ...(memberSince && { memberSince }),
        minecraftData: {
          deleteMany: {},
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

    await prisma.mCMember.update({
      where: {
        discordID,
      },
      data: {
        trialMember,
        ...(memberSince && { memberSince }),
        minecraftData: {
          deleteMany: {},
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

export async function storeApplication(application: ApplicationObject, discordID: Snowflake) {
  await prisma.application.create({
    data: {
      discordID,
      content: application,
    },
  });
}

export async function getApplicationsFromID(discordID: Snowflake) {
  const applications = await prisma.application.findMany({
    where: {
      discordID,
    },
  });

  if (!applications || applications.length === 0) {
    throw new Error(`Application with ID ${discordID} not found.`);
  }

  return applications;
}

export async function getLatestApplicationFromID(discordID: Snowflake) {
  const applications = await getApplicationsFromID(discordID);

  const latestApplication = applications.sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }
    return 0;
  })[0];

  return latestApplication;
}

export async function getLatestApplication() {
  const applications = await prisma.application.findMany();

  const latestApplication = applications.sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }
    return 0;
  })[0];

  return latestApplication;
}
