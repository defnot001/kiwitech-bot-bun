import {
	ApplicationCommandOptionType,
	EmbedBuilder,
	type TextChannel,
	WebhookClient,
	inlineCode,
} from 'discord.js';
import { config } from '../config';
import TodoModelController, { type Todo } from '../database/model/todoModelController';
import { BaseKiwiCommandHandler } from '../util/commandhandler';
import { displayFormatted } from '../util/format';
import { Command } from '../util/handler/classes/Command';
import type { ExtendedClient } from '../util/handler/classes/ExtendedClient';
import type { ExtendedInteraction } from '../util/handler/types';
import { getTextChannelFromConfig } from '../util/helpers';
import { LOGGER } from '../util/logger';

export const todo = new Command({
	name: 'todo',
	description: 'Add, update, or complete a todo item.',
	options: [
		{
			name: 'add',
			description: 'Add a todo item.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'type',
					description: 'Choose wether the todo is related to survival or creative gameplay.',
					type: ApplicationCommandOptionType.String,
					required: true,
					choices: [
						{ name: 'survival', value: 'survival' },
						{ name: 'creative', value: 'creative' },
					],
				},
				{
					name: 'title',
					description: 'The title of the todo item.',
					type: ApplicationCommandOptionType.String,
					required: true,
				},
			],
		},
		{
			name: 'update',
			description: 'Update a todo item.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'title',
					description: 'The title of the todo item.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true,
				},
				{
					name: 'newtitle',
					description: 'The new title of the todo item.',
					type: ApplicationCommandOptionType.String,
					required: true,
				},
			],
		},
		{
			name: 'complete',
			description: 'Complete a todo item.',
			type: ApplicationCommandOptionType.Subcommand,
			options: [
				{
					name: 'title',
					description: 'The title of the todo item.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: true,
				},
			],
		},
	],
	execute: async ({ interaction, client, args }) => {
		await interaction.deferReply({ ephemeral: true });

		const handler = new TodoCommandHandler({ interaction, client });

		if (!(await handler.init())) {
			return;
		}

		const subcommand = args.getSubcommand() as 'add' | 'update' | 'complete';

		if (subcommand === 'add') {
			await handler.handleAdd({
				todoType: args.getString('type') as 'survival' | 'creative',
				title: args.getString('title', true),
			});

			return;
		}

		if (subcommand === 'update') {
			await handler.handleUpdate({
				oldTitle: args.getString('title', true),
				newTitle: args.getString('newtitle', true),
			});

			return;
		}

		if (subcommand === 'complete') {
			await handler.handleComplete({ title: args.getString('title', true) });
			return;
		}
	},
});

class TodoCommandHandler extends BaseKiwiCommandHandler {
	private readonly _webhookClient: WebhookClient | null = null;
	private _todoChannel: TextChannel | null = null;
	private _todoLogChannel: TextChannel | null = null;

	public constructor(options: { interaction: ExtendedInteraction; client: ExtendedClient }) {
		super({ client: options.client, interaction: options.interaction });

		try {
			this._webhookClient = new WebhookClient({ url: config.webhooks.todo });
		} catch {
			this._webhookClient = null;
		}
	}

	public override async init() {
		const baseInitSuccess = await super.init();

		if (!baseInitSuccess) {
			return false;
		}

		const todoChannel = await getTextChannelFromConfig(this.guild, 'todo');
		const todoLogChannel = await getTextChannelFromConfig(this.guild, 'todoLog');

		if (!todoChannel || !todoLogChannel) {
			await this.interaction.editReply('Failed to find the todo channels!');
			return false;
		}

		this._todoChannel = todoChannel;
		this._todoLogChannel = todoLogChannel;

		if (!this._webhookClient) {
			await this.interaction.editReply('Failed to connect to the webhook!');
			await LOGGER.error(new Error('Failed to connect to the todo webhook'));
			return false;
		}

		return true;
	}

	private get webhookClient() {
		if (!this._webhookClient) {
			throw new Error('Webhook client is not available. Ensure init() is called.');
		}

		return this._webhookClient;
	}

	private get todoChannel() {
		if (!this._todoChannel) {
			throw new Error('Todo channel is not available. Ensure init() is called.');
		}

		return this._todoChannel;
	}

	private get todoLogChannel() {
		if (!this._todoLogChannel) {
			throw new Error('Todo log channel is not available. Ensure init() is called.');
		}

		return this._todoLogChannel;
	}

	public async handleAdd(args: { todoType: 'survival' | 'creative'; title: string }) {
		const { todoType, title } = args;

		const todo = await TodoModelController.addTodo({
			title,
			createdBy: this.user.id,
			type: todoType,
		}).catch(async (e) => {
			await LOGGER.error(e, 'Failed to add todo item');
			return null;
		});

		if (!todo) {
			await this.interaction.editReply('Failed to add todo item!');
		}

		await this.sendTodoLogEmbed(
			`${displayFormatted(this.user)} a new todo item for the ${todoType} list: ${inlineCode(
				title,
			)}`,
		);

		const result = await this.postUpdatedTodos();

		if (!result) {
			await this.interaction.editReply('Failed to update todo list!');
			return;
		}

		await this.interaction.editReply('Successfully added todo item to the database.');
	}

	public async handleUpdate(args: { oldTitle: string; newTitle: string }) {
		const newTitle = args.newTitle.trim();
		const oldTitle = args.oldTitle.trim();

		if (!newTitle || !oldTitle) {
			await this.interaction.editReply('Please provide a valid new and old title.');
			return;
		}

		const updated = await TodoModelController.updateTodoTitle({ newTitle, oldTitle }).catch(
			async (e) => {
				await LOGGER.error(e, 'Failed to update todo item');
				return null;
			},
		);

		if (!updated) {
			await this.interaction.editReply('Failed to update todo item!');
			return;
		}

		await this.sendTodoLogEmbed(
			`${displayFormatted(this.user)} updated a todo item: "${inlineCode(
				oldTitle,
			)}" to "${inlineCode(newTitle)}".`,
		);

		const result = await this.postUpdatedTodos();

		if (!result) {
			await this.interaction.editReply('Failed to update todo list!');
			return;
		}

		await this.interaction.editReply('Successfully updated todo item in the database.');
	}

	public async handleComplete(args: { title: string }) {
		const title = args.title.trim();

		if (!title) {
			await this.interaction.editReply('Please provide a valid title.');
			return;
		}

		const completed = await TodoModelController.completeTodo(title).catch(async (e) => {
			await LOGGER.error(e, 'Failed to complete todo item');
			return null;
		});

		if (!completed) {
			await this.interaction.editReply('Failed to complete todo item!');
			return;
		}

		await this.sendTodoLogEmbed(
			`${displayFormatted(this.user)} completed a todo item: ${inlineCode(title)}.`,
		);

		const result = await this.postUpdatedTodos();

		if (!result) {
			await this.interaction.editReply('Failed to update todo list!');
			return;
		}

		await this.interaction.editReply('Successfully completed todo item.');
	}

	private buildTodoLogEmbed(description: string): EmbedBuilder {
		return new EmbedBuilder({
			description,
			title: `${this.guild.name} Todo Log`,
			color: config.embedColors.default,
			footer: {
				text: this.user.username,
				iconURL: this.user.displayAvatarURL(),
			},
			timestamp: new Date(),
		});
	}

	/**
	 * Creates a todo log embed and sends it to the todo log channel.
	 * @sideeffect Sends a message to the todo log channel.
	 * @sideeffect Logs an error if the message fails to send.
	 */
	private async sendTodoLogEmbed(description: string) {
		const embed = this.buildTodoLogEmbed(description);

		try {
			await this.todoLogChannel.send({ embeds: [embed] });
		} catch (e) {
			await LOGGER.error(e, 'Failed to send todo log embed');
		}
	}

	/**
	 * Removes all messages from the todo channel and post new embeds from querying the database.
	 * @sideeffect Removes all messages in the todo channel.
	 * @sideeffect Logs an error if any operations fail.
	 */
	private async postUpdatedTodos(): Promise<boolean> {
		const survivalTodos = await TodoModelController.getTodoByType('survival').catch(async (e) => {
			await LOGGER.error(e, 'Failed to get survival todos');
			return null;
		});

		const creativeTodos = await TodoModelController.getTodoByType('creative').catch(async (e) => {
			await LOGGER.error(e, 'Failed to get creative todos');
			return null;
		});

		if (!survivalTodos || !creativeTodos) {
			return false;
		}

		const survivalEmbed = new EmbedBuilder({
			title: 'Survival Todo List',
			color: config.embedColors.darkpurple,
			description: this.displayTodos(survivalTodos),
			timestamp: new Date(),
		});

		const creativeEmbed = new EmbedBuilder({
			title: 'Creative Todo List',
			color: config.embedColors.purple,
			description: this.displayTodos(creativeTodos),
			timestamp: new Date(),
		});

		await this.clearTodoChannel();

		await this.webhookClient.send({
			embeds: [survivalEmbed, creativeEmbed],
		});

		return true;
	}

	private async clearTodoChannel() {
		const messages = await this.todoChannel.messages.fetch().catch(async (e) => {
			await LOGGER.error(e, 'Failed to fetch messages in todo channel');
			return null;
		});

		if (!messages) {
			return;
		}

		if (messages.size > 0) {
			await Promise.all(messages.map((message) => message.delete())).catch(async (e) => {
				await LOGGER.error(e, 'Failed to delete messages in todo channel');
			});
		}
	}

	private displayTodos(todos: Todo[]) {
		return todos.map((todo) => `• ${todo.title}`).join('\n');
	}
}
