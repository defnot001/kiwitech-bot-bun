import { ApplicationCommandOptionType } from 'discord.js';
import { config } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { display } from '../util/format';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';

export const roletoggle = new Command({
	name: 'roletoggle',
	description: 'Toggle different roles.',
	options: [
		{
			name: 'rolename',
			description: 'The role you want to toggle.',
			type: ApplicationCommandOptionType.String,
			required: true,
			choices: [
				{
					name: 'PingPong',
					value: 'pingPong',
				},
				{
					name: 'KiwiInc',
					value: 'kiwiInc',
				},
			],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply({ ephemeral: true });

		const handler = new PingPingCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		await handler.handlePingPong({
			rolename: args.getString('rolename', true) as 'pingPong' | 'kiwiInc',
		});
	},
});

class PingPingCommandHandler extends BaseKiwiCommandHandler {
	public async handlePingPong(args: { rolename: 'pingPong' | 'kiwiInc' }) {
		if (!this.member.roles.cache.has(config.roles.member)) {
			await this.interaction.editReply('This command can only be used by full members!');
			return;
		}

		const targetRole = await this.guild.roles
			.fetch(config.roles[args.rolename])
			.catch(async (e) => {
				await LOGGER.error(e, `Failed to fetch the role ${args.rolename}`);
				return null;
			});

		if (!targetRole) {
			await this.interaction.editReply(
				`Failed to fetch the role ${args.rolename}. Please contact an admin!`,
			);
			return;
		}

		if (this.member.roles.cache.has(config.roles[args.rolename])) {
			try {
				await this.member.roles.remove(targetRole);
				await this.interaction.editReply(
					`Successfully removed the ${args.rolename} role from your roles!`,
				);
			} catch (e) {
				await LOGGER.error(
					e,
					`Failed to remove the ${args.rolename} role from ${display(this.member)}`,
				);
				await this.interaction.editReply(
					'An error occurred while trying to remove the role! Please contact an admin!',
				);
			}
			return;
		}

		try {
			await this.member.roles.add(targetRole);
			await this.interaction.editReply(
				`Successfully added the ${args.rolename} role to your roles!`,
			);
		} catch (e) {
			await LOGGER.error(e, `Failed to add the ${args.rolename} role to ${display(this.member)}`);
			await this.interaction.editReply(
				'An error occurred while trying to add the role! Please contact an admin!',
			);
		}
	}
}
