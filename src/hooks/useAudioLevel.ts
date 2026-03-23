import { useCallback, useEffect, useRef, useState } from "react";

export interface UseAudioLevelOptions {
	/**
	 * Whether the audio level monitor is active
	 */
	enabled?: boolean;
	/**
	 * Callback when audio level changes (0-1)
	 */
	onLevelChange?: (level: number) => void;
	/**
	 * Smoothing factor for the level (0-1, higher = smoother)
	 */
	smoothing?: number;
}

/**
 * Hook to monitor audio levels from a MediaStream
 * Returns a value between 0 and 1 representing the average audio level
 */
export function useAudioLevel(
	stream: MediaStream | null | undefined,
	options: UseAudioLevelOptions = {},
): number {
	const { enabled = true, onLevelChange, smoothing = 0.8 } = options;
	const [level, setLevel] = useState(0);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const smoothingRef = useRef(smoothing);

	// Update smoothing ref when prop changes
	useEffect(() => {
		smoothingRef.current = smoothing;
	}, [smoothing]);

	const stopMonitoring = useCallback(() => {
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}
		if (audioContextRef.current) {
			audioContextRef.current.close().catch(() => {
				// Ignore close errors
			});
			audioContextRef.current = null;
		}
		analyserRef.current = null;
		sourceRef.current = null;
	}, []);

	useEffect(() => {
		if (!enabled || !stream) {
			stopMonitoring();
			setLevel(0);
			return;
		}

		const audioTrack = stream.getAudioTracks()[0];
		if (!audioTrack) {
			setLevel(0);
			return;
		}

		// Create audio context and analyser
		const audioContext = new AudioContext();
		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 256;
		analyser.smoothingTimeConstant = smoothingRef.current;

		const source = audioContext.createMediaStreamSource(stream);
		source.connect(analyser);

		audioContextRef.current = audioContext;
		analyserRef.current = analyser;
		sourceRef.current = source;

		const dataArray = new Uint8Array(analyser.frequencyBinCount);

		let previousLevel = 0;

		const tick = () => {
			analyser.getByteFrequencyData(dataArray);

			// Calculate average level
			let sum = 0;
			for (let i = 0; i < dataArray.length; i++) {
				sum += dataArray[i];
			}
			const rawLevel = sum / dataArray.length / 255; // Normalize to 0-1

			// Apply smoothing
			const smoothedLevel =
				previousLevel * smoothingRef.current + rawLevel * (1 - smoothingRef.current);
			previousLevel = smoothedLevel;

			setLevel(smoothedLevel);
			onLevelChange?.(smoothedLevel);

			animationFrameRef.current = requestAnimationFrame(tick);
		};

		tick();

		return () => {
			stopMonitoring();
		};
	}, [enabled, stream, onLevelChange, stopMonitoring]);

	return level;
}

/**
 * Hook to monitor audio levels from multiple MediaStreams
 * Returns an object with levels for each stream keyed by their identifier
 */
export function useAudioLevels(
	streams: Map<string, MediaStream>,
	options: UseAudioLevelOptions = {},
): Map<string, number> {
	const { enabled = true, smoothing = 0.8 } = options;
	const [levels, setLevels] = useState<Map<string, number>>(new Map());
	const monitorsRef = useRef<
		Map<
			string,
			{
				audioContext: AudioContext;
				analyser: AnalyserNode;
				animationFrame: number | null;
			}
		>
	>(new Map());

	useEffect(() => {
		if (!enabled) {
			// Clean up all monitors
			for (const monitor of monitorsRef.current.values()) {
				if (monitor.animationFrame !== null) {
					cancelAnimationFrame(monitor.animationFrame);
				}
				// Ignore close errors during cleanup
				monitor.audioContext.close().catch(() => undefined);
			}
			monitorsRef.current.clear();
			setLevels(new Map());
			return;
		}

		const currentKeys = new Set(streams.keys());
		const monitorKeys = new Set(monitorsRef.current.keys());

		// Remove monitors for streams that no longer exist
		for (const key of monitorKeys) {
			if (!currentKeys.has(key)) {
				const monitor = monitorsRef.current.get(key);
				if (monitor) {
					if (monitor.animationFrame !== null) {
						cancelAnimationFrame(monitor.animationFrame);
					}
					// Ignore close errors during cleanup
					monitor.audioContext.close().catch(() => undefined);
				}
				monitorsRef.current.delete(key);
			}
		}

		// Add monitors for new streams
		for (const [key, stream] of streams) {
			if (!monitorsRef.current.has(key)) {
				const audioTrack = stream.getAudioTracks()[0];
				if (!audioTrack) continue;

				const audioContext = new AudioContext();
				const analyser = audioContext.createAnalyser();
				analyser.fftSize = 256;
				analyser.smoothingTimeConstant = smoothing;

				const source = audioContext.createMediaStreamSource(stream);
				source.connect(analyser);

				monitorsRef.current.set(key, {
					audioContext,
					analyser,
					animationFrame: null,
				});
			}
		}

		// Start monitoring loop
		const tick = () => {
			const newLevels = new Map<string, number>();

			for (const [key, monitor] of monitorsRef.current) {
				const dataArray = new Uint8Array(monitor.analyser.frequencyBinCount);
				monitor.analyser.getByteFrequencyData(dataArray);

				let sum = 0;
				for (let i = 0; i < dataArray.length; i++) {
					sum += dataArray[i];
				}
				newLevels.set(key, sum / dataArray.length / 255);
			}

			setLevels(newLevels);

			// Schedule next tick
			for (const monitor of monitorsRef.current.values()) {
				monitor.animationFrame = requestAnimationFrame(tick);
				break; // Only need to schedule once
			}
		};

		tick();

		return () => {
			for (const monitor of monitorsRef.current.values()) {
				if (monitor.animationFrame !== null) {
					cancelAnimationFrame(monitor.animationFrame);
				}
				// Ignore close errors during cleanup
				monitor.audioContext.close().catch(() => undefined);
			}
			monitorsRef.current.clear();
		};
	}, [enabled, streams, smoothing]);

	return levels;
}
