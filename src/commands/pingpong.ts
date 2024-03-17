import { config } from '../config';
import { Command } from '../util/handler/classes/Command';
import { LOGGER } from '../util/logger';

export default new Command({
	name: 'pingpong',
	description:
		'Toggle the PingPong role to receive or stop receiving notifications about applications.',
	execute: async ({ interaction }) => {
		try {
			await interaction.deferReply({ ephemeral: true });

			const pingPongRole = await interaction.guild?.roles.fetch(config.roles.pingPong);

			if (!pingPongRole) {
				throw new Error('Failed to get the member role from the guild role manager');
			}

			if (!interaction.member.roles.cache.has(config.roles.member)) {
				await interaction.editReply('This command can only be used by full members!');
				return;
			}

			if (interaction.member.roles.cache.has(config.roles.pingPong)) {
				await interaction.member.roles.remove(pingPongRole);
				await interaction.editReply(
					'Successfully removed the PingPong role from your roles. You will no longer be notified about applications!',
				);

				return;
			}

			await interaction.member.roles.add(pingPongRole);
			await interaction.editReply(
				'Successfully added the PingPong role to your roles. You will be notified about applications! To change this, use the command again.',
			);

			return;
		} catch (e) {
			await LOGGER.error(e, 'Failed to execute the pingpong command!');

			return;
		}
	},
});
