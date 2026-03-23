type PendingConsumer = {
	resolve: (frame: VideoFrame | null) => void;
	reject: (error: Error) => void;
};

export class AsyncVideoFrameQueue {
	private frames: VideoFrame[] = [];
	private consumers: PendingConsumer[] = [];
	private error: Error | null = null;
	private closed = false;

	get length() {
		return this.frames.length;
	}

	enqueue(frame: VideoFrame) {
		this.push(frame);
	}

	push(frame: VideoFrame) {
		if (this.closed) {
			frame.close();
			return;
		}

		const consumer = this.consumers.shift();
		if (consumer) {
			consumer.resolve(frame);
			return;
		}

		this.frames.push(frame);
	}

	fail(error: Error) {
		this.error = error;
		this.closed = true;
		const consumers = this.consumers.splice(0);
		for (const consumer of consumers) {
			consumer.reject(error);
		}
		for (const frame of this.frames) {
			frame.close();
		}
		this.frames = [];
	}

	close() {
		this.done();
	}

	done() {
		this.closed = true;
		const consumers = this.consumers.splice(0);
		for (const consumer of consumers) {
			consumer.resolve(null);
		}
	}

	async dequeue(): Promise<VideoFrame | null> {
		if (this.error) {
			throw this.error;
		}

		if (this.frames.length > 0) {
			return this.frames.shift() ?? null;
		}

		if (this.closed) {
			return null;
		}

		return await new Promise<VideoFrame | null>((resolve, reject) => {
			this.consumers.push({ resolve, reject });
		});
	}

	async getFrameAt(timestampUs: number): Promise<VideoFrame | null> {
		// Drain frames that are significantly older than requested timestamp
		const epsilon = 1000; // 1ms
		while (this.frames.length > 0 && this.frames[0].timestamp < timestampUs - epsilon) {
			const oldFrame = this.frames.shift();
			oldFrame?.close();
		}

		if (this.frames.length > 0 && Math.abs(this.frames[0].timestamp - timestampUs) <= epsilon) {
			return this.frames.shift()!;
		}

		if (this.closed && this.frames.length === 0) {
			return null;
		}

		// If no frames in queue, wait for the next one
		const nextFrame = await this.dequeue();
		if (!nextFrame) return null;

		if (nextFrame.timestamp < timestampUs - epsilon) {
			nextFrame.close();
			return this.getFrameAt(timestampUs);
		}

		return nextFrame;
	}

	destroy() {
		this.close();
		for (const frame of this.frames) {
			frame.close();
		}
		this.frames = [];
	}
}
