import { AsyncVideoFrameQueue } from "./asyncVideoFrameQueue";
import { StreamingVideoDecoder } from "./streamingDecoder";

/**
 * Web Worker for video export.
 * Handles video decoding (via StreamingVideoDecoder) and encoding (via VideoEncoder).
 * Delegate rendering to main thread via postMessage to avoid bundling PixiJS in worker.
 */

interface ExportConfig {
	videoUrl: string;
	width: number;
	height: number;
	fps: number;
	bitrate: number;
	hardwareAcceleration: HardwareAcceleration;
	trimRegions?: any[];
	speedRegions?: any[];
	webcamUrl?: string;
}

let decoder: StreamingVideoDecoder | null = null;
let encoder: VideoEncoder | null = null;
let isCancelled = false;

// Pending render requests: exportTimestampUs -> Resolve function
const pendingRenders = new Map<number, (bitmap: ImageBitmap) => void>();

self.onmessage = async (e: MessageEvent) => {
	const { type, config, payload } = e.data;

	switch (type) {
		case "start":
			try {
				isCancelled = false;
				await exportVideo(config);
			} catch (error) {
				(self as any).postMessage({
					type: "error",
					error: error instanceof Error ? error.message : String(error),
				});
			}
			break;

		case "rendered": {
			const { exportTimestampUs, bitmap } = payload;
			const resolve = pendingRenders.get(exportTimestampUs);
			if (resolve) {
				pendingRenders.delete(exportTimestampUs);
				resolve(bitmap);
			}
			break;
		}

		case "cancel":
			isCancelled = true;
			if (decoder) decoder.cancel();
			break;
	}
};

async function exportVideo(config: ExportConfig) {
	decoder = new StreamingVideoDecoder();
	const videoInfo = await decoder.loadMetadata(config.videoUrl);

	let webcamDecoder: StreamingVideoDecoder | null = null;
	if (config.webcamUrl) {
		webcamDecoder = new StreamingVideoDecoder();
		await webcamDecoder.loadMetadata(config.webcamUrl);
	}

	(self as any).postMessage({
		type: "metadata",
		payload: { videoInfo },
	});

	let fatalEncoderError: Error | null = null;
	encoder = new VideoEncoder({
		output: (chunk, metadata) => {
			const data = new ArrayBuffer(chunk.byteLength);
			chunk.copyTo(data);
			(self as any).postMessage(
				{
					type: "chunk",
					payload: {
						chunk: {
							type: chunk.type,
							timestamp: chunk.timestamp,
							duration: chunk.duration,
							byteLength: chunk.byteLength,
							data,
						},
						metadata,
					},
				},
				[data],
			);
		},
		error: (e) => {
			fatalEncoderError = new Error(`VideoEncoder error: ${e.message}`);
		},
	});

	encoder.configure({
		codec: "avc1.42E01E", // H.264 Baseline
		width: config.width,
		height: config.height,
		bitrate: config.bitrate,
		framerate: config.fps,
		hardwareAcceleration: config.hardwareAcceleration,
		avc: { format: "annexb" },
	});

	const frameDuration = 1_000_000 / config.fps;
	const webcamQueue = webcamDecoder ? new AsyncVideoFrameQueue() : null;

	if (webcamDecoder && webcamQueue) {
		webcamDecoder
			.decodeAll(config.fps, config.trimRegions, config.speedRegions, async (frame) => {
				webcamQueue.push(frame);
			})
			.finally(() => {
				webcamQueue.done();
			});
	}

	// For render delegation, we need to maintain frame order for encoding.
	// We'll process decoding and wait for renders in sequence (with some parallelism).
	const MAX_CONCURRENT_RENDERS = 10;
	let framesInFlight = 0;

	await decoder.decodeAll(
		config.fps,
		config.trimRegions,
		config.speedRegions,
		async (videoFrame, exportTimestampUs, sourceTimestampMs) => {
			if (isCancelled || fatalEncoderError) {
				videoFrame.close();
				return;
			}

			// Wait if we have too many concurrent renders
			while (framesInFlight >= MAX_CONCURRENT_RENDERS && !isCancelled) {
				await new Promise((resolve) => setTimeout(resolve, 5));
			}

			if (isCancelled) {
				videoFrame.close();
				return;
			}

			framesInFlight++;

			const webcamFrame = webcamQueue ? await webcamQueue.getFrameAt(exportTimestampUs) : null;

			// Delegate rendering to main thread
			const renderPromise = new Promise<ImageBitmap>((resolve) => {
				pendingRenders.set(exportTimestampUs, resolve);
			});

			(self as any).postMessage(
				{
					type: "render",
					payload: {
						videoFrame,
						webcamFrame,
						exportTimestampUs,
						sourceTimestampMs,
					},
				},
				webcamFrame ? [videoFrame, webcamFrame] : [videoFrame],
			);

			// We don't await BEFORE rendering next frame to allow parallelism.
			// But the encoding MUST be in order.
			// So we'll wrap the encoding in a promise that we track.
			processRenderedFrame(renderPromise, exportTimestampUs);
		},
	);

	async function processRenderedFrame(renderPromise: Promise<ImageBitmap>, timestamp: number) {
		try {
			const bitmap = await renderPromise;
			if (isCancelled) {
				bitmap.close();
				return;
			}

			const exportFrame = new VideoFrame(bitmap, {
				timestamp,
				duration: frameDuration,
			});

			encoder?.encode(exportFrame);
			exportFrame.close();
			bitmap.close();
		} catch (err) {
			console.error("[ExportWorker] Frame processing failed:", err);
		} finally {
			framesInFlight--;
		}
	}

	// Wait for all frames to be rendered and encoded
	while (framesInFlight > 0 && !isCancelled) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	if (fatalEncoderError) throw fatalEncoderError;

	await encoder.flush();
	encoder.close();
	encoder = null;

	if (webcamDecoder) {
		webcamDecoder.destroy();
	}

	(self as any).postMessage({ type: "done" });
}
