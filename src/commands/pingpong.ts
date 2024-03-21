import { config } from '../config';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { display } from '../util/format';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';

export const pingpong = new Command({
	name: 'pingpong',
	description:
		'Toggle the PingPong role to receive or stop receiving notifications about applications.',
	execute: async ({ interaction, client }) => {
		await interaction.deferReply({ ephemeral: true });

		const handler = new PingPingCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		await handler.handlePingPong();
	},
});

class PingPingCommandHandler extends BaseKiwiCommandHandler {
	public async handlePingPong() {
		if (!this.member.roles.cache.has(config.roles.member)) {
			await this.interaction.editReply('This command can only be used by full members!');
			return;
		}

		const pingPongRole = await this.guild.roles.fetch(config.roles.pingPong).catch(async (e) => {
			await LOGGER.error(e, 'Failed to get the pingpong role from the guild role manager');
			return null;
		});

		if (!pingPongRole) {
			await this.interaction.editReply('Failed to execute the command. Please try again!');
			return;
		}

		if (this.member.roles.cache.has(config.roles.pingPong)) {
			try {
				await this.member.roles.remove(pingPongRole);
				await this.interaction.editReply(
					'Successfully removed the PingPong role from your roles. You will no longer be notified about applications!',
				);
			} catch (e) {
				await LOGGER.error(e, `Failed to remove the pingpong role from ${display(this.member)}`);
				await this.interaction.editReply('An error occurred while trying to remove the role!');
			}
			return;
		}

		try {
			await this.member.roles.add(pingPongRole);
			await this.interaction.editReply(
				'Successfully added the PingPong role to your roles. You will be notified about applications! To change this, use the command again.',
			);
		} catch (e) {
			await LOGGER.error(e, `Failed to add the pingpong role to ${display(this.member)}`);
			await this.interaction.editReply('An error occurred while trying to add the role!');
		}
	}
}
