import { Socket, connect } from 'net';
import { PacketType, Packet } from './packet';
import PacketUtils from './packet';
import { createSplitter } from './splitter';
import { PromiseQueue } from './queue';
import { EventEmitter } from 'events';
import { RconEmitter } from './EventEmitter';

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

    if (config.maxPending) {
      this.emitter.setMaxListeners(config.maxPending);
    }
  }

  public async connect() {
    if (this.socket) {
      throw new Error('Already connected or connecting');
    }

    const socket = (this.socket = connect({
      host: this.config.host,
      port: this.config.port,
    }));

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.on('connect', () => {
          socket.off('error', reject);
          resolve();
        });
      });
    } catch (error) {
      this.socket = null;
      throw error;
    }

    socket.setNoDelay(true);
    socket.on('error', (error) => this.emitter.emit('error', error));

    this.emitter.emit('connect');

    this.socket.on('close', () => {
      this.emitter.emit('end');
      this.sendQueue.pause();
      this.socket = null;
      this.authenticated = false;
    });

    this.socket.pipe(createSplitter()).on('data', this.handlePacket.bind(this));

    const id = this.requestId;
    const packet = await this.sendPacket(
      'Auth',
      Buffer.from(this.config.password),
    );

    this.sendQueue.resume();

    if (packet.id != id || packet.id == -1) {
      this.sendQueue.pause();
      this.socket.destroy();
      this.socket = null;
      throw new Error('Authentication failed');
    }

    this.authenticated = true;
    this.emitter.emit('authenticated');
    return this;
  }

  /**
      Close the connection to the server.
    */
  public async end() {
    if (!this.socket || this.socket.connecting) {
      throw new Error('Not connected');
    }
    if (!this.socket.writable) throw new Error('End called twice');
    this.sendQueue.pause();
    this.socket.end();
    await new Promise<void>((resolve) => this.on('end', () => resolve()));
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
      throw new Error('Not connected');
    }

    const packet = await this.sendPacket('Command', buffer);
    return packet.payload;
  }

  private async sendPacket(
    type: keyof typeof PacketType,
    payload: Buffer,
  ): Promise<Packet> {
    const id = this.requestId++;

    const createSendPromise = (): Promise<Packet> => {
      this.socket!.write(
        PacketUtils.encodePacket({ id, payload, type: PacketType[type] }),
      );

      return new Promise<Packet>((resolve, reject) => {
        const onEnd = () => (
          reject(new Error('Connection closed')), clearTimeout(timeout)
        );
        this.emitter.on('end', onEnd);

        const timeout = setTimeout(() => {
          this.off('end', onEnd);
          reject(new Error(`Timeout for packet id ${id}`));
        }, this.config.timeout);

        this.callbacks.set(id, (packet) => {
          this.off('end', onEnd);
          clearTimeout(timeout);
          resolve(packet);
        });
      });
    };

    if (type === 'Auth') {
      return createSendPromise();
    } else {
      return (await this.sendQueue.add(createSendPromise)) as Promise<Packet>;
    }
  }

  private handlePacket(data: Buffer) {
    const packet = PacketUtils.decodePacket(data);

    const id = this.authenticated ? packet.id : this.requestId - 1;
    const handler = this.callbacks.get(id);

    if (handler) {
      handler(packet);
      this.callbacks.delete(id);
    }
  }
}
