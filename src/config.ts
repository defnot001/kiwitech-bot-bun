import path from 'node:path';
import { env } from 'bun';

const nodeEnv = Bun.env.NODE_ENV || 'development';
console.info(`Loaded ${nodeEnv} config.`);

export const config = {
	bot: {
		token: env.DISCORD_BOT_TOKEN,
		clientID: env.DISCORD_CLIENT_ID,
		guildID: env.DISCORD_GUILD_ID,
	},
	database: {
		url: env.DATABASE_URL,
	},
	ptero: {
		url: env.PTERO_URL,
		apiKey: env.PTERO_API_KEY,
	},
	channels: {
		memberLog: env.CHANNEL_MEMBERLOG,
		modLog: env.CHANNEL_MODLOG,
		botLog: env.CHANNEL_BOTLOG,
		invite: env.CHANNEL_INVITE,
		resources: env.CHANNEL_RESOURCES,
		serverInfo: env.CHANNEL_SERVERINFO,
		todo: env.CHANNEL_TODO,
		todoLog: env.CHANNEL_TODO_LOG,
		application: env.CHANNEL_APPLICATION,
		applicationVoting: env.CHANNEL_APPLICATION_VOTING,
		applicationCategory: env.CATEGORY_APPLICATION,
		memberGeneral: env.CHANNEL_MEMBER_GENERAL,
	},
	roles: {
		member: env.ROLE_MEMBER,
		members: env.ROLE_MEMBERS,
		trialMember: env.ROLE_TRIALMEMBER,
		admins: env.ROLE_ADMIN,
		pingPong: env.ROLE_PINGPONG,
		kiwiInc: env.ROLE_KIWIINC,
	},
	webhooks: {
		todo: env.TODO_WEBHOOK_URL,
	},
	embedColors: {
		default: 3_517_048,
		none: 3_092_790,
		red: 13_382_451,
		orange: 16_737_843,
		yellow: 16_769_536,
		green: 6_736_998,
		darkpurple: 3_866_688,
		purple: 5_243_182,
	},
	emoji: {
		kiwi: env.EMOJI_KIWI,
		owoKiwi: env.EMOJI_OWOKIWI,
		froghypers: env.EMOJI_FROGHYPERS,
		frogYes: env.EMOJI_YES,
		frogNo: env.EMOJI_NO,
	},
	mcConfig: {
		smp: {
			host: env.MINECRAFT_SERVER_IP,
			port: Number.parseInt(env.MINECRAFT_SMP_PORT),
			serverId: env.MINECRAFT_SMP_SERVERID,
			rconPort: Number.parseInt(env.MINECRAFT_SMP_RCON_PORT),
			rconPasswd: env.MINECRAFT_SMP_RCON_PASSWORD,
			operator: false,
			backupLimit: 8,
		},
		cmp: {
			host: env.MINECRAFT_SERVER_IP,
			port: Number.parseInt(env.MINECRAFT_CMP_PORT),
			serverId: env.MINECRAFT_CMP_SERVERID,
			rconPort: Number.parseInt(env.MINECRAFT_CMP_RCON_PORT),
			rconPasswd: env.MINECRAFT_CMP_RCON_PASSWORD,
			operator: true,
			backupLimit: 8,
		},
		cmp2: {
			host: env.MINECRAFT_SERVER_IP,
			port: Number.parseInt(env.MINECRAFT_CMP2_PORT),
			serverId: env.MINECRAFT_CMP2_SERVERID,
			rconPort: Number.parseInt(env.MINECRAFT_CMP2_RCON_PORT),
			rconPasswd: env.MINECRAFT_CMP2_RCON_PASSWORD,
			operator: true,
			backupLimit: 1,
		},
		copy: {
			host: env.MINECRAFT_SERVER_IP,
			port: Number.parseInt(env.MINECRAFT_COPY_PORT),
			serverId: env.MINECRAFT_COPY_SERVERID,
			rconPort: Number.parseInt(env.MINECRAFT_COPY_RCON_PORT),
			rconPasswd: env.MINECRAFT_COPY_RCON_PASSWORD,
			operator: true,
			backupLimit: 3,
		},
		snapshots: {
			host: env.MINECRAFT_SERVER_IP,
			port: Number.parseInt(env.MINECRAFT_SNAPSHOTS_PORT),
			serverId: env.MINECRAFT_SNAPSHOTS_SERVERID,
			rconPort: Number.parseInt(env.MINECRAFT_SNAPSHOTS_RCON_PORT),
			rconPasswd: env.MINECRAFT_SNAPSHOTS_RCON_PASSWORD,
			operator: true,
			backupLimit: 0,
		},
	},
	application: {
		id: env.APPLICATION_SECRET,
	},
} as const;

export const projectPaths = {
	sources: path.join(path.dirname(import.meta.dir), 'src'),
	commands: path.join(path.dirname(import.meta.dir), 'src/commands'),
	events: path.join(path.dirname(import.meta.dir), 'src/events'),
};

function isConfigFullySet(config: { [key: string]: unknown }): boolean {
	for (const key in config) {
		const value = config[key];

		// Check if the value is an object and recurse, ignore null since typeof null === 'object' <- JS is the best language ever
		if (typeof value === 'object' && value !== null) {
			if (!isConfigFullySet(value as { [key: string]: unknown })) {
				return false;
			}
		} else {
			if (value === undefined) {
				console.error(`Missing value for key: ${key}`);
				return false;
			}
		}
	}
	return true;
}

if (!isConfigFullySet(config)) {
	throw new Error('Config not fully set');
}

export type Config = typeof config;
export type ServerChoice = keyof Config['mcConfig'];
export type ChannelConfig = (typeof config)['channels'];
export type EmojiConfig = (typeof config)['emoji'];
