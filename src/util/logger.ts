import { EmbedBuilder } from '@discordjs/builders';
import { client } from '..';
import { TextChannel } from 'discord.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const colors = {
  reset: '\x1b[0m',
  debug: '\x1b[36m', // Cyan for better visibility
  info: '\x1b[34m', // Blue
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
};

let errorLog: TextChannel | null = null;

export abstract class LOGGER {
  constructor() {}

  public static setLogChannel(channel: TextChannel | null): void {
    errorLog = channel;
  }

  public static debug(message: string): void {
    this.log(message, 'debug');
  }

  public static info(message: string): void {
    this.log(message, 'info');
  }

  public static async warn(message: string): Promise<void> {
    this.log(message, 'warn');
    try {
      const embed = this.buildLogEmbed(message, 'warn');
      await errorLog?.send({ embeds: [embed] });
    } catch (e) {
      this.log(`Failed to send error log to errorLog channel: ${e}`, 'error');
    }
  }

  public static async error(message: string): Promise<void> {
    this.log(message, 'error');

    try {
      const embed = this.buildLogEmbed(message, 'error');
      await errorLog?.send({ embeds: [embed] });
    } catch (e) {
      this.log(`Failed to send error log to errorLog channel: ${e}`, 'error');
    }
  }

  private static buildLogEmbed(message: string, level: 'warn' | 'error') {
    const errorLogEmbed = new EmbedBuilder({
      description: message,
      color: level === 'warn' ? 16_776_960 : 16_711_680,
      author: {
        name: 'Janitor',
        icon_url: client.user?.displayAvatarURL(),
      },
      footer: {
        text: 'Error Log',
      },
    });

    return errorLogEmbed.setTimestamp(Date.now());
  }

  private static log(message: string, logLevel: LogLevel): void {
    const now = new Date();
    const timeString = `[${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}] [${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}]`;
    const logLevelString = `${this.displayLogLevel(logLevel)}:`;
    const coloredPrefix = `${colors[logLevel]}${timeString} ${logLevelString}${colors.reset}`;

    console.log(`${coloredPrefix} ${message}`);
  }

  private static displayLogLevel(logLevel: LogLevel): string {
    switch (logLevel) {
      case 'debug':
        return 'DEBUG';
      case 'info':
        return 'INFO';
      case 'warn':
        return 'WARN';
      case 'error':
        return 'ERROR';
      default:
        return 'UNKNOWN'; // Fallback case
    }
  }
}
