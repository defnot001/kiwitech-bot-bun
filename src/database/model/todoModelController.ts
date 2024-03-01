import { Snowflake } from 'discord.js';
import { pgClient } from '../..';

export type Todo = {
  id: number;
  title: string;
  type: 'survival' | 'creative';
  createdBy: Snowflake;
  createdAt: Date;
  updatedAt: Date;
};

export default abstract class TodoModelController {
  static async getAllTodos() {
    const query = await pgClient.query('SELECT * FROM todos');

    return query.rows as Todo[];
  }

  static async getTodoByType(type: 'survival' | 'creative') {
    const query = await pgClient.query('SELECT * FROM todos WHERE type = $1', [type]);

    return query.rows as Todo[];
  }

  static async addTodo(
    title: string,
    type: 'survival' | 'creative',
    createdBy: Snowflake,
    createdAt?: Date,
  ) {
    const query = await pgClient.query(
      'INSERT INTO todos (title, type, created_by, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, type, createdBy, createdAt ?? new Date()],
    );

    return query.rows[0] as Todo;
  }

  static async updateTodoTitle(old_title: string, new_title: string) {
    const query = await pgClient.query('UPDATE todos SET title = $1 WHERE title = $2 RETURNING *', [
      new_title,
      old_title,
    ]);

    return query.rows[0] as Todo;
  }

  static async completeTodo(title: string) {
    const query = await pgClient.query('DELETE FROM todos WHERE title = $1 RETURNING *', [title]);

    return query.rows[0] as Todo;
  }
}
