import { EventEmitter } from 'node:events';

export interface RconEvents {
	connect: () => void;
	authenticated: () => void;
	end: () => void;
	error: (error: unknown) => void;
}

export class RconEmitter extends EventEmitter {
	on<K extends keyof RconEvents>(event: K, listener: RconEvents[K]): this {
		return super.on(event, listener);
	}
}
