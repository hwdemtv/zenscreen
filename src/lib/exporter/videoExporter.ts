import type {
	AnnotationRegion,
	CropRegion,
	SpeedRegion,
	TrimRegion,
	WebcamLayoutPreset,
	ZoomRegion,
} from "@/components/video-editor/types";
import { AudioProcessor } from "./audioEncoder";
import { FrameRenderer } from "./frameRenderer";
import { VideoMuxer } from "./muxer";
import type { ExportConfig, ExportProgress, ExportResult } from "./types";

interface VideoExporterConfig extends ExportConfig {
	videoUrl: string;
	webcamVideoUrl?: string;
	wallpaper: string;
	zoomRegions: ZoomRegion[];
	trimRegions?: TrimRegion[];
	speedRegions?: SpeedRegion[];
	showShadow: boolean;
	shadowIntensity: number;
	showBlur: boolean;
	motionBlurAmount?: number;
	borderRadius?: number;
	padding?: number;
	videoPadding?: number;
	cropRegion: CropRegion;
	webcamLayoutPreset?: WebcamLayoutPreset;
	webcamPosition?: { cx: number; cy: number } | null;
	annotationRegions?: AnnotationRegion[];
	previewWidth?: number;
	previewHeight?: number;
	watermarkText?: string;
	onProgress?: (progress: ExportProgress) => void;
}

export class VideoExporter {
	private config: VideoExporterConfig;
	private muxer: VideoMuxer | null = null;
	private audioProcessor: AudioProcessor | null = null;
	private cancelled = false;
	private worker: Worker | null = null;
	private renderer: FrameRenderer | null = null;
	private videoDescription: Uint8Array | undefined;
	private videoColorSpace: VideoColorSpaceInit | undefined;
	private chunkCount = 0;

	constructor(config: VideoExporterConfig) {
		this.config = config;
	}

	async export(): Promise<ExportResult> {
		const encoderPreferences = this.getEncoderPreferences();
		let lastError: Error | null = null;

		for (const encoderPreference of encoderPreferences) {
			try {
				return await this.exportWithEncoderPreference(encoderPreference);
			} catch (error) {
				const normalizedError = error instanceof Error ? error : new Error(String(error));
				lastError = normalizedError;

				if (this.cancelled) {
					return { success: false, error: "Export cancelled" };
				}

				console.warn(
					`[VideoExporter] ${encoderPreference} export attempt failed:`,
					normalizedError,
				);
			} finally {
				this.cleanup();
			}
		}

		return {
			success: false,
			error: lastError?.message || "Export failed",
		};
	}

	private async exportWithEncoderPreference(
		hardwareAcceleration: HardwareAcceleration,
	): Promise<ExportResult> {
		this.cleanup();
		this.cancelled = false;
		this.chunkCount = 0;

		return new Promise((resolve, reject) => {
			try {
				// Use Vite's worker constructor
				this.worker = new Worker(new URL("./exportWorker.ts", import.meta.url), {
					type: "module",
				});

				const muxer = new VideoMuxer(this.config, true);
				this.muxer = muxer;

				// Initialize renderer on main thread to avoid PixiJS worker bundling issues
				this.renderer = new FrameRenderer({
					...this.config,
					videoWidth: 1920, // Will be updated on first frame if needed
					videoHeight: 1080,
				});

				this.worker.onmessage = async (e) => {
					const { type, payload, chunk, meta, progress, error, hasAudio } = e.data;

					if (type === "progress") {
						this.reportProgress(progress);
					} else if (type === "render") {
						const { videoFrame, webcamFrame, exportTimestampUs } = payload;
						try {
							if (!this.renderer) throw new Error("Renderer not initialized");
							if (!this.renderer.isReady()) {
								// Lazy init or first frame setup
								await this.renderer.initialize();
							}

							await this.renderer.renderFrame(videoFrame, exportTimestampUs, webcamFrame);
							const canvas = this.renderer.getCanvas();
							const bitmap = await createImageBitmap(canvas);

							this.worker?.postMessage(
								{
									type: "rendered",
									payload: { exportTimestampUs, bitmap },
								},
								[bitmap],
							);
						} catch (err) {
							console.error("[VideoExporter] Rendering failed:", err);
						} finally {
							videoFrame.close();
							webcamFrame?.close();
						}
					} else if (type === "chunk") {
						try {
							await this.handleVideoChunk(chunk, meta);
						} catch (err) {
							this.worker?.terminate();
							reject(err);
						}
					} else if (type === "done") {
						try {
							await this.finalizeExport(hasAudio);
							const blob = await muxer.finalize();
							resolve({ success: true, blob });
						} catch (err) {
							reject(err);
						}
					} else if (type === "error") {
						reject(new Error(error));
					}
				};

				this.worker.onerror = (e) => {
					reject(new Error(`Worker error: ${e.message}`));
				};

				// Create a sanitized config for the worker (remove functions)
				const workerConfig = {
					...this.config,
					hardwareAcceleration,
					onProgress: undefined,
				};

				this.worker.postMessage({ type: "start", config: workerConfig });
			} catch (err) {
				reject(err);
			}
		});
	}

	private async handleVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
		if (!this.muxer) return;

		if (meta?.decoderConfig?.description && !this.videoDescription) {
			const desc = meta.decoderConfig.description;
			if (desc instanceof ArrayBuffer) {
				this.videoDescription = new Uint8Array(desc);
			} else if (ArrayBuffer.isView(desc)) {
				this.videoDescription = new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength);
			} else {
				// SharedArrayBuffer or similar
				this.videoDescription = new Uint8Array(desc as unknown as ArrayBuffer);
			}
		}

		if (meta?.decoderConfig?.colorSpace && !this.videoColorSpace) {
			this.videoColorSpace = meta.decoderConfig.colorSpace;
		}

		const isFirstChunk = this.chunkCount === 0;
		this.chunkCount++;

		if (isFirstChunk && this.videoDescription) {
			const colorSpace = this.videoColorSpace || {
				primaries: "bt709",
				transfer: "iec61966-2-1",
				matrix: "rgb",
				fullRange: true,
			};

			const metadata: EncodedVideoChunkMetadata = {
				decoderConfig: {
					codec: this.config.codec || "avc1.640033",
					codedWidth: this.config.width,
					codedHeight: this.config.height,
					description: this.videoDescription,
					colorSpace,
				},
			};

			await this.muxer.addVideoChunk(chunk, metadata);
		} else {
			await this.muxer.addVideoChunk(chunk, meta);
		}
	}

	private async finalizeExport(hasAudio: boolean) {
		if (!this.muxer) return;

		if (hasAudio && !this.cancelled) {
			// We need a demuxer to process audio.
			// Since we want to keep logic here for now (especially if speed regions are used),
			// we create a temporary demuxer or pass the URL again.
			const { WebDemuxer } = await import("web-demuxer");
			const wasmUrl = new URL("./wasm/web-demuxer.wasm", window.location.href).href;
			const demuxer = new WebDemuxer({ wasmFilePath: wasmUrl });

			try {
				const fileResponse = await fetch(this.config.videoUrl);
				const blob = await fileResponse.blob();
				const file = new File([blob], "input.mp4", { type: "video/mp4" });
				await demuxer.load(file);

				const videoInfo = await demuxer.getDecoderConfig("video"); // Just to check duration
				const readEndSec = (videoInfo as any).duration + 0.5;

				console.log("[VideoExporter] Processing audio track in main thread...");
				this.audioProcessor = new AudioProcessor();
				await this.audioProcessor.process(
					demuxer,
					this.muxer,
					this.config.videoUrl,
					this.config.trimRegions,
					this.config.speedRegions,
					readEndSec,
				);
			} finally {
				demuxer.destroy();
			}
		}
	}

	cancel(): void {
		this.cancelled = true;
		if (this.worker) {
			this.worker.postMessage({ type: "cancel" });
			this.worker.terminate();
			this.worker = null;
		}
		if (this.audioProcessor) {
			this.audioProcessor.cancel();
		}
		this.cleanup();
	}

	private cleanup(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		if (this.renderer) {
			this.renderer.destroy();
			this.renderer = null;
		}
		this.chunkCount = 0;
		this.videoDescription = undefined;
		this.videoColorSpace = undefined;
	}

	private getEncoderPreferences(): HardwareAcceleration[] {
		if (typeof navigator !== "undefined" && /\bWindows\b/i.test(navigator.userAgent)) {
			return ["prefer-software", "prefer-hardware"];
		}
		return ["prefer-hardware", "prefer-software"];
	}

	private reportProgress(progress: ExportProgress): void {
		this.config.onProgress?.(progress);
	}
}
