/**
 * Audio utilities for recording
 */

export interface AudioLevelMonitor {
	analyser: AnalyserNode;
	start: () => void;
	stop: () => void;
	getLevel: () => number;
}

/**
 * Create an audio level monitor for a media stream
 */
export function createAudioLevelMonitor(
	stream: MediaStream,
	onLevelChange?: (level: number) => void,
): AudioLevelMonitor | null {
	const audioTrack = stream.getAudioTracks()[0];
	if (!audioTrack) {
		return null;
	}

	const audioContext = new AudioContext();
	const analyser = audioContext.createAnalyser();
	analyser.fftSize = 256;
	analyser.smoothingTimeConstant = 0.8;

	const source = audioContext.createMediaStreamSource(stream);
	source.connect(analyser);

	const dataArray = new Uint8Array(analyser.frequencyBinCount);
	let animationFrameId: number | null = null;

	const getLevel = (): number => {
		analyser.getByteFrequencyData(dataArray);
		let sum = 0;
		for (let i = 0; i < dataArray.length; i++) {
			sum += dataArray[i];
		}
		return sum / dataArray.length / 255; // Normalize to 0-1
	};

	const start = () => {
		const tick = () => {
			if (onLevelChange) {
				onLevelChange(getLevel());
			}
			animationFrameId = requestAnimationFrame(tick);
		};
		tick();
	};

	const stop = () => {
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		audioContext.close().catch(() => {
			// Ignore close errors
		});
	};

	return { analyser, start, stop, getLevel };
}

/**
 * Get optimal sample rate for audio mixing
 * WebRTC typically uses 48kHz, but we should match the source if possible
 */
export function getOptimalSampleRate(
	systemAudioTrack: MediaStreamTrack | null,
	micAudioTrack: MediaStreamTrack | null,
): number {
	const DEFAULT_SAMPLE_RATE = 48000;

	// Try to get sample rate from track settings
	const systemSettings = systemAudioTrack?.getSettings();
	const micSettings = micAudioTrack?.getSettings();

	// Prefer the higher sample rate
	const rates = [systemSettings?.sampleRate, micSettings?.sampleRate, DEFAULT_SAMPLE_RATE].filter(
		(r): r is number => typeof r === "number" && r > 0,
	);

	return Math.max(...rates);
}

/**
 * Audio mixing configuration
 */
export interface AudioMixConfig {
	systemGain: number;
	micGain: number;
	sampleRate: number;
}

/**
 * Default audio mix configuration
 */
export const DEFAULT_AUDIO_MIX_CONFIG: AudioMixConfig = {
	systemGain: 1.0,
	micGain: 1.4, // Boost mic to match system audio level
	sampleRate: 48000,
};
