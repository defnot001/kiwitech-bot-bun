import type { Guild, GuildMember } from 'discord.js';
import type { ExtendedClient } from './handler/classes/ExtendedClient';
import type { ExtendedInteraction } from './handler/types';

interface KiwiCommandHandler {
	init(): Promise<boolean>;
}

export abstract class BaseKiwiCommandHandler implements KiwiCommandHandler {
	protected readonly interaction: ExtendedInteraction;
	protected readonly client: ExtendedClient;
	protected readonly member: GuildMember;
	private _guild: Guild | null;

	public constructor(options: {
		interaction: ExtendedInteraction;
		client: ExtendedClient;
	}) {
		this.interaction = options.interaction;
		this.client = options.client;
		this._guild = this.interaction.guild;
		this.member = this.interaction.member;
	}

	public async init(): Promise<boolean> {
		if (!this.guild) {
			if (this.interaction.deferred || this.interaction.replied) {
				await this.interaction.editReply('This command can only be used in a server.');
			} else {
				await this.interaction.reply('This command can only be used in a server.');
			}

			return false;
		}

		return true;
	}

	protected get guild(): Guild {
		if (!this._guild) {
			throw new Error(
				'Guild is not available. Ensure init() is called and the command is used in a server context.',
			);
		}

		return this._guild;
	}
}
