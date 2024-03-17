interface QueuedItem<T> {
	promiseGenerator: () => Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
}

export class PromiseQueue<T = unknown> {
	private paused = false;
	private readonly queue: QueuedItem<T>[] = [];
	private pendingPromiseCount = 0;
	public readonly maxConcurrent: number;

	constructor(maxConcurrent = 1) {
		this.maxConcurrent = maxConcurrent;
	}

	async add(promiseGenerator: () => Promise<T>) {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({ promiseGenerator, resolve, reject });
			this.dequeue();
		});
	}

	pause() {
		this.paused = true;
	}

	resume() {
		this.paused = false;
		this.dequeue();
	}

	private async dequeue() {
		if (this.paused || this.pendingPromiseCount >= this.maxConcurrent) {
			return;
		}

		const item = this.queue.shift();

		if (!item) {
			return;
		}

		this.pendingPromiseCount++;

		try {
			const value = await item.promiseGenerator();
			item.resolve(value);
		} catch (e) {
			item.reject(e);
		} finally {
			this.pendingPromiseCount--;
			this.dequeue();
		}
	}
}
