import fs from "node:fs/promises";
import path from "node:path";
import {
	BrowserWindow,
	desktopCapturer,
	dialog,
	ipcMain,
	screen,
	systemPreferences,
} from "electron";
import {
	type RecordingSession,
	type StoreRecordedSessionInput,
} from "../../src/lib/recordingSession";
import { mainT } from "../i18n";
import { RECORDINGS_DIR } from "../main";

const RECORDING_SESSION_SUFFIX = ".session.json";
const CURSOR_TELEMETRY_VERSION = 1;
const CURSOR_SAMPLE_INTERVAL_MS = 100;
const MAX_CURSOR_SAMPLES = 60 * 60 * 10; // 1 hour @ 10Hz

export interface SelectedSource {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
	appIcon: string | null;
}

interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
}

// State managed within this module
let selectedSource: SelectedSource | null = null;
let currentRecordingSession: RecordingSession | null = null;
let cursorCaptureInterval: NodeJS.Timeout | null = null;
let cursorCaptureStartTimeMs = 0;
let activeCursorSamples: CursorTelemetryPoint[] = [];
let pendingCursorSamples: CursorTelemetryPoint[] = [];

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function normalizeVideoSourcePath(videoPath?: string | null): string | null {
	if (typeof videoPath !== "string") return null;
	const trimmed = videoPath.trim();
	if (!trimmed) return null;
	if (/^(zenscreen|file):\/\//i.test(trimmed)) {
		try {
			const url = new URL(trimmed.replace(/^zenscreen:/i, "http:"));
			const pathname = decodeURIComponent(url.pathname);
			if (/^\/[a-zA-Z]:/.test(pathname)) {
				return pathname.slice(1);
			}
			return pathname;
		} catch {
			/* ignore */
		}
	}
	return trimmed;
}

function stopCursorCapture() {
	if (cursorCaptureInterval) {
		clearInterval(cursorCaptureInterval);
		cursorCaptureInterval = null;
	}
}

function sampleCursorPoint() {
	const cursor = screen.getCursorScreenPoint();
	const sourceDisplayId = Number(selectedSource?.display_id);
	const sourceDisplay = Number.isFinite(sourceDisplayId)
		? (screen.getAllDisplays().find((display) => display.id === sourceDisplayId) ?? null)
		: null;
	const display = sourceDisplay ?? screen.getDisplayNearestPoint(cursor);
	const bounds = display.bounds;
	const width = Math.max(1, bounds.width);
	const height = Math.max(1, bounds.height);

	const cx = clamp((cursor.x - bounds.x) / width, 0, 1);
	const cy = clamp((cursor.y - bounds.y) / height, 0, 1);

	activeCursorSamples.push({
		timeMs: Math.max(0, Date.now() - cursorCaptureStartTimeMs),
		cx,
		cy,
	});

	if (activeCursorSamples.length > MAX_CURSOR_SAMPLES) {
		activeCursorSamples.shift();
	}
}

async function storeRecordedSessionFiles(payload: StoreRecordedSessionInput) {
	const createdAt =
		typeof payload.createdAt === "number" && Number.isFinite(payload.createdAt)
			? payload.createdAt
			: Date.now();
	const screenVideoPath = path.join(RECORDINGS_DIR, payload.screen.fileName);
	await fs.writeFile(screenVideoPath, Buffer.from(payload.screen.videoData));

	let webcamVideoPath: string | undefined;
	if (payload.webcam) {
		webcamVideoPath = path.join(RECORDINGS_DIR, payload.webcam.fileName);
		await fs.writeFile(webcamVideoPath, Buffer.from(payload.webcam.videoData));
	}

	const session: RecordingSession = webcamVideoPath
		? { screenVideoPath, webcamVideoPath, createdAt }
		: { screenVideoPath, createdAt };

	currentRecordingSession = session;

	const telemetryPath = `${screenVideoPath}.cursor.json`;
	if (pendingCursorSamples.length > 0) {
		await fs.writeFile(
			telemetryPath,
			JSON.stringify({ version: CURSOR_TELEMETRY_VERSION, samples: pendingCursorSamples }, null, 2),
			"utf-8",
		);
	}
	pendingCursorSamples = [];

	const sessionManifestPath = path.join(
		RECORDINGS_DIR,
		`${path.parse(payload.screen.fileName).name}${RECORDING_SESSION_SUFFIX}`,
	);
	await fs.writeFile(sessionManifestPath, JSON.stringify(session, null, 2), "utf-8");

	return {
		success: true,
		path: screenVideoPath,
		session,
		message: mainT("dialogs", "ipc.recordingSessionStored"),
	};
}

export function registerMediaHandlers(
	getMainWindow: () => BrowserWindow | null,
	getSourceSelectorWindow: () => BrowserWindow | null,
	createEditorWindow: () => void,
	createSourceSelectorWindow: () => BrowserWindow,
	onRecordingStateChange?: (recording: boolean, sourceName: string) => void,
) {
	ipcMain.handle("get-sources", async (_, opts) => {
		const sources = await desktopCapturer.getSources(opts);
		return sources.map((source) => ({
			id: source.id,
			name: source.name,
			display_id: source.display_id,
			thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
			appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
		}));
	});

	ipcMain.handle("select-source", (_, source: SelectedSource) => {
		selectedSource = source;
		const sourceSelectorWin = getSourceSelectorWindow();
		if (sourceSelectorWin) {
			sourceSelectorWin.close();
		}
		return selectedSource;
	});

	ipcMain.handle("get-selected-source", () => {
		return selectedSource;
	});

	ipcMain.handle("open-source-selector", () => {
		const sourceSelectorWin = getSourceSelectorWindow();
		if (sourceSelectorWin) {
			sourceSelectorWin.focus();
			return;
		}
		createSourceSelectorWindow();
	});

	ipcMain.handle("switch-to-editor", () => {
		const mainWin = getMainWindow();
		if (mainWin) {
			mainWin.close();
		}
		createEditorWindow();
	});

	ipcMain.handle("request-camera-access", async () => {
		if (process.platform !== "darwin") {
			return { success: true, granted: true, status: "granted" };
		}

		try {
			const status = systemPreferences.getMediaAccessStatus("camera");
			if (status === "granted") return { success: true, granted: true, status };

			if (status === "not-determined") {
				const granted = await systemPreferences.askForMediaAccess("camera");
				return {
					success: true,
					granted,
					status: granted ? "granted" : systemPreferences.getMediaAccessStatus("camera"),
				};
			}

			return { success: true, granted: false, status };
		} catch (error) {
			console.error("Failed to request camera access:", error);
			return { success: false, granted: false, status: "unknown", error: String(error) };
		}
	});

	ipcMain.handle("store-recorded-session", async (_, payload: StoreRecordedSessionInput) => {
		try {
			return await storeRecordedSessionFiles(payload);
		} catch (error) {
			console.error("Failed to store recording session:", error);
			return {
				success: false,
				message: mainT("dialogs", "ipc.failedToStoreSession"),
				error: String(error),
			};
		}
	});

	ipcMain.handle("get-recorded-video-path", async () => {
		try {
			if (currentRecordingSession?.screenVideoPath) {
				return { success: true, path: currentRecordingSession.screenVideoPath };
			}

			const files = await fs.readdir(RECORDINGS_DIR);
			const videoFiles = files.filter(
				(file: string) => file.endsWith(".webm") && !file.endsWith("-webcam.webm"),
			);

			if (videoFiles.length === 0) {
				return { success: false, message: mainT("dialogs", "ipc.noRecordedVideo") };
			}

			const latestVideo = videoFiles.sort().reverse()[0];
			const videoPath = path.join(RECORDINGS_DIR, latestVideo);

			return { success: true, path: videoPath };
		} catch (error) {
			console.error("Failed to get video path:", error);
			return {
				success: false,
				message: mainT("dialogs", "ipc.failedToGetVideoPath"),
				error: String(error),
			};
		}
	});

	ipcMain.handle("open-video-file-picker", async () => {
		try {
			const result = await dialog.showOpenDialog({
				title: mainT("dialogs", "fileDialogs.selectVideo"),
				defaultPath: RECORDINGS_DIR,
				filters: [
					{
						name: mainT("dialogs", "fileDialogs.videoFiles"),
						extensions: ["webm", "mp4", "mov", "avi", "mkv"],
					},
					{ name: mainT("dialogs", "fileDialogs.allFiles"), extensions: ["*"] },
				],
				properties: ["openFile"],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false, canceled: true };
			}

			return {
				success: true,
				path: result.filePaths[0],
			};
		} catch (error) {
			console.error("Failed to open file picker:", error);
			return {
				success: false,
				message: mainT("dialogs", "ipc.failedToOpenPicker"),
				error: String(error),
			};
		}
	});

	ipcMain.handle("set-current-video-path", async (_, videoPath: string) => {
		// Note: loadRecordedSessionForVideoPath would be needed here if you want full session recovery
		// For now, simple path set is fine
		currentRecordingSession = {
			screenVideoPath: normalizeVideoSourcePath(videoPath) ?? videoPath,
			createdAt: Date.now(),
		};
		return { success: true };
	});

	ipcMain.handle("get-current-video-path", () => {
		return currentRecordingSession?.screenVideoPath
			? { success: true, path: currentRecordingSession.screenVideoPath }
			: { success: false };
	});

	ipcMain.handle("clear-current-video-path", () => {
		currentRecordingSession = null;
		return { success: true };
	});

	ipcMain.handle("set-recording-state", (_, recording: boolean) => {
		if (recording) {
			stopCursorCapture();
			activeCursorSamples = [];
			pendingCursorSamples = [];
			cursorCaptureStartTimeMs = Date.now();
			sampleCursorPoint();
			cursorCaptureInterval = setInterval(sampleCursorPoint, CURSOR_SAMPLE_INTERVAL_MS);
		} else {
			stopCursorCapture();
			pendingCursorSamples = [...activeCursorSamples];
			activeCursorSamples = [];
		}

		const source = selectedSource || { name: "Screen" };
		if (onRecordingStateChange) {
			onRecordingStateChange(recording, source.name);
		}
	});

	ipcMain.handle("get-cursor-telemetry", async (_, videoPath?: string) => {
		const targetVideoPath = normalizeVideoSourcePath(
			videoPath ?? currentRecordingSession?.screenVideoPath,
		);
		if (!targetVideoPath) {
			return { success: true, samples: [] };
		}

		const telemetryPath = `${targetVideoPath}.cursor.json`;
		try {
			const content = await fs.readFile(telemetryPath, "utf-8");
			const parsed = JSON.parse(content);
			const rawSamples = Array.isArray(parsed)
				? parsed
				: Array.isArray(parsed?.samples)
					? parsed.samples
					: [];

			const samples: CursorTelemetryPoint[] = rawSamples
				.filter((sample: unknown) => Boolean(sample && typeof sample === "object"))
				.map((sample: unknown) => {
					const point = sample as Partial<CursorTelemetryPoint>;
					return {
						timeMs:
							typeof point.timeMs === "number" && Number.isFinite(point.timeMs)
								? Math.max(0, point.timeMs)
								: 0,
						cx:
							typeof point.cx === "number" && Number.isFinite(point.cx)
								? clamp(point.cx, 0, 1)
								: 0.5,
						cy:
							typeof point.cy === "number" && Number.isFinite(point.cy)
								? clamp(point.cy, 0, 1)
								: 0.5,
					};
				})
				.sort((a: CursorTelemetryPoint, b: CursorTelemetryPoint) => a.timeMs - b.timeMs);

			return { success: true, samples };
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT") {
				return { success: true, samples: [] };
			}
			console.error("Failed to load cursor telemetry:", error);
			return {
				success: false,
				message: mainT("dialogs", "ipc.failedToLoadCursorTelemetry"),
				error: String(error),
				samples: [],
			};
		}
	});
}

// These getters/setters will help projectHandlers keep things in sync if needed
export function getCurrentRecordingSessionState(): RecordingSession | null {
	return currentRecordingSession;
}

export function setCurrentRecordingSessionState(session: RecordingSession | null) {
	currentRecordingSession = session;
}
