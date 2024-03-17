import { EventEmitter } from 'node:events';
import { type Socket, connect } from 'node:net';
import type { RconEmitter } from './EventEmitter';
import { RCON_ERROR_MESSAGES, RconError } from './errors';
import { type Packet, PacketType } from './packet';
import PacketUtils from './packet';
import { PromiseQueue } from './queue';
import { createSplitter } from './splitter';

export interface RconOptions {
	host: string;
	port: number;
	password: string;
	/**
	 * Maximum time for a packet to arrive before an error is thrown
	 * @default 2000 ms
	 */
	timeout?: number;
	/**
	 * Maximum number of parallel requests. Most minecraft servers can
	 * only reliably process one packet at a time.
	 * @default 1
	 */
	maxPending?: number;
}

const DEFAULT_RCON_OPTIONS = {
	timeout: 2000,
	maxPending: 1,
} as const;

export class Rcon {
	static async connect(config: RconOptions): Promise<Rcon> {
		const rcon = new Rcon(config);
		await rcon.connect();
		return rcon;
	}

	private readonly sendQueue: PromiseQueue;
	private readonly callbacks = new Map<number, (packet: Packet) => void>();
	private requestId = 0;

	public readonly config: Required<RconOptions>;

	public readonly emitter: RconEmitter = new EventEmitter();
	private socket: Socket | null = null;
	public authenticated = false;

	public readonly on = this.emitter.on.bind(this.emitter);
	public readonly once = this.emitter.once.bind(this.emitter);
	public readonly off = this.emitter.removeListener.bind(this.emitter);

	constructor(config: RconOptions) {
		this.config = { ...DEFAULT_RCON_OPTIONS, ...config };
		this.sendQueue = new PromiseQueue(this.config.maxPending);

		this.emitter.setMaxListeners(config.maxPending ?? DEFAULT_RCON_OPTIONS.maxPending);
	}

	public async connect() {
		if (this.socket) {
			return Promise.reject(new RconError(RCON_ERROR_MESSAGES.ALREADY_CONNECTED));
		}

		this.setupSocket();

		try {
			await this.waitForConnection();
		} catch (err) {
			this.handleError(err, RCON_ERROR_MESSAGES.CONNECTION_FAILED);
			throw err;
		}

		this.setupSocketEvents();

		try {
			await this.authenticate();
		} catch (err) {
			this.handleError(err, RCON_ERROR_MESSAGES.AUTH_FAILED);
			throw err;
		}

		return this;
	}

	/**
      Close the connection to the server.
    */
	public async end() {
		if (!this.socket || this.socket.connecting) {
			throw new RconError(RCON_ERROR_MESSAGES.NOT_CONNECTED);
		}

		if (!this.socket.writable) {
			throw new RconError(RCON_ERROR_MESSAGES.END_CALLED_TWICE);
		}

		this.sendQueue.pause();
		this.socket.end();
		await new Promise<void>((resolve) => this.once('end', () => resolve()));
	}

	/**
      Send a command to the server.

      @param command The command that will be executed on the server.
      @returns A promise that will be resolved with the command's response from the server.
    */
	public async send(command: string) {
		const payload = await this.sendRaw(Buffer.from(command, 'utf-8'));
		return payload.toString('utf-8');
	}

	public async sendRaw(buffer: Buffer) {
		if (!this.authenticated || !this.socket) {
			throw new RconError(RCON_ERROR_MESSAGES.NOT_CONNECTED);
		}

		try {
			const packet = await this.sendPacket('Command', buffer);

			return packet.payload;
		} catch (err) {
			this.handleError(err, 'Failed to send command');
			throw err;
		}
	}

	private setupSocket(): void {
		this.socket = connect({
			host: this.config.host,
			port: this.config.port,
		});
	}

	private async waitForConnection(): Promise<void> {
		if (!this.socket) {
			throw new RconError(RCON_ERROR_MESSAGES.SOCKET_NOT_INITIALIZED);
		}

		const errorHandler = (err: Error) => {
			this.socket?.off('error', errorHandler);
			this.socket?.off('connect', connectHandler);
			throw err;
		};

		const connectHandler = () => {
			this.socket?.off('error', errorHandler);
		};

		this.socket.once('error', errorHandler);
		await new Promise<void>((resolve) => {
			this.socket?.once('connect', () => {
				resolve();
			});
		});
	}

	private setupSocketEvents(): void {
		if (!this.socket) {
			throw new RconError(RCON_ERROR_MESSAGES.SOCKET_NOT_INITIALIZED);
		}

		this.socket.setNoDelay(true);
		this.socket.on('error', (error) => this.emitter.emit('error', error));

		this.emitter.emit('connect');

		this.socket.on('close', () => {
			this.emitter.emit('end');
			this.sendQueue.pause();
			this.socket = null;
			this.authenticated = false;
		});

		this.socket.pipe(createSplitter()).on('data', this.handlePacket.bind(this));
	}

	private async authenticate(): Promise<void> {
		if (!this.socket) {
			throw new RconError(RCON_ERROR_MESSAGES.SOCKET_NOT_INITIALIZED);
		}

		const id = this.requestId;
		const packet = await this.sendPacket('Auth', Buffer.from(this.config.password));

		this.sendQueue.resume();

		if (packet.id !== id || packet.id === -1) {
			this.sendQueue.pause();
			this.socket.destroy();
			this.socket = null;
			throw new RconError(RCON_ERROR_MESSAGES.AUTH_FAILED);
		}

		this.authenticated = true;
		this.emitter.emit('authenticated');
	}

	private async sendPacket(type: keyof typeof PacketType, payload: Buffer): Promise<Packet> {
		const id = this.requestId++;

		const createSendPromise = (): Promise<Packet> => {
			if (!this.socket) {
				throw new RconError(RCON_ERROR_MESSAGES.SOCKET_NOT_INITIALIZED);
			}

			try {
				this.socket.write(PacketUtils.encodePacket({ id, payload, type: PacketType[type] }));

				const packetPromise = this.createPacketPromise(id);
				const timeoutPromise = this.createTimeoutPromise(id);

				return Promise.race([packetPromise, timeoutPromise]);
			} catch (err) {
				this.handleError(err, 'Failed to write to socket');
				throw err;
			}
		};

		if (type === 'Auth') {
			return await createSendPromise();
		}

		return (await this.sendQueue.add(createSendPromise)) as Promise<Packet>;
	}

	private createPacketPromise(id: number): Promise<Packet> {
		let timeout: NodeJS.Timeout;

		return new Promise<Packet>((resolve, reject) => {
			const onEnd = () => {
				reject(new Error('Connection closed'));
				clearTimeout(timeout);
			};

			this.emitter.on('end', onEnd);

			this.callbacks.set(id, (packet) => {
				this.off('end', onEnd);
				clearTimeout(timeout);
				resolve(packet);
			});
		});
	}

	private createTimeoutPromise(id: number): Promise<Packet> {
		return new Promise<Packet>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Timeout for packet id ${id}`));
			}, this.config.timeout);
		});
	}

	private handlePacket(data: Buffer) {
		let packet = null;

		try {
			packet = PacketUtils.decodePacket(data);
		} catch (err) {
			this.handleError(err, 'Failed to decode packet');
			return;
		}

		const id = this.authenticated ? packet.id : this.requestId - 1;
		const handler = this.callbacks.get(id);

		if (handler) {
			handler(packet);
			this.callbacks.delete(id);
		}
	}

	private handleError(error: unknown, message: string) {
		if (error instanceof Error && 'message' in error) {
			this.emitter.emit('error', new RconError(`${message}: ${error.message}`));
		} else {
			this.emitter.emit('error', new RconError(`${message} but no error message was provided`));
		}
	}
}
