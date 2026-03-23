import fs from "node:fs/promises";
import path from "node:path";
import { app, dialog, ipcMain } from "electron";
import {
	normalizeProjectMedia,
	normalizeRecordingSession,
	type RecordingSession,
} from "../../src/lib/recordingSession";
import { mainT } from "../i18n";
import { RECORDINGS_DIR } from "../main";
import { getCurrentRecordingSessionState, setCurrentRecordingSessionState } from "./mediaHandlers";

const PROJECT_FILE_EXTENSION = "openscreen";
const SHORTCUTS_FILE = path.join(app.getPath("userData"), "shortcuts.json");

let currentProjectPath: string | null = null;

function normalizePath(filePath: string) {
	return path.resolve(filePath);
}

function isTrustedProjectPath(filePath?: string | null) {
	if (!filePath || !currentProjectPath) {
		return false;
	}
	return normalizePath(filePath) === normalizePath(currentProjectPath);
}

export function registerProjectHandlers() {
	ipcMain.handle(
		"save-project-file",
		async (_, projectData: unknown, suggestedName?: string, existingProjectPath?: string) => {
			try {
				const trustedExistingProjectPath = isTrustedProjectPath(existingProjectPath)
					? existingProjectPath
					: null;

				if (trustedExistingProjectPath) {
					await fs.writeFile(
						trustedExistingProjectPath,
						JSON.stringify(projectData, null, 2),
						"utf-8",
					);
					currentProjectPath = trustedExistingProjectPath;
					return {
						success: true,
						path: trustedExistingProjectPath,
						message: mainT("dialogs", "ipc.projectSaved"),
					};
				}

				const safeName = (suggestedName || `project-${Date.now()}`).replace(/[^a-zA-Z0-9-_]/g, "_");
				const defaultName = safeName.endsWith(`.${PROJECT_FILE_EXTENSION}`)
					? safeName
					: `${safeName}.${PROJECT_FILE_EXTENSION}`;

				const result = await dialog.showSaveDialog({
					title: mainT("dialogs", "fileDialogs.saveProject"),
					defaultPath: path.join(RECORDINGS_DIR, defaultName),
					filters: [
						{
							name: mainT("dialogs", "fileDialogs.openscreenProject"),
							extensions: [PROJECT_FILE_EXTENSION],
						},
						{ name: "JSON", extensions: ["json"] },
					],
					properties: ["createDirectory", "showOverwriteConfirmation"],
				});

				if (result.canceled || !result.filePath) {
					return {
						success: false,
						canceled: true,
						message: mainT("dialogs", "ipc.saveProjectCanceled"),
					};
				}

				await fs.writeFile(result.filePath, JSON.stringify(projectData, null, 2), "utf-8");
				currentProjectPath = result.filePath;

				return {
					success: true,
					path: result.filePath,
					message: mainT("dialogs", "ipc.projectSaved"),
				};
			} catch (error) {
				console.error("Failed to save project file:", error);
				return {
					success: false,
					message: mainT("dialogs", "ipc.failedToSaveProject"),
					error: String(error),
				};
			}
		},
	);

	ipcMain.handle("load-project-file", async () => {
		try {
			const result = await dialog.showOpenDialog({
				title: mainT("dialogs", "fileDialogs.openProject"),
				defaultPath: RECORDINGS_DIR,
				filters: [
					{
						name: mainT("dialogs", "fileDialogs.openscreenProject"),
						extensions: [PROJECT_FILE_EXTENSION],
					},
					{ name: "JSON", extensions: ["json"] },
					{ name: mainT("dialogs", "fileDialogs.allFiles"), extensions: ["*"] },
				],
				properties: ["openFile"],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return {
					success: false,
					canceled: true,
					message: mainT("dialogs", "ipc.openProjectCanceled"),
				};
			}

			const filePath = result.filePaths[0];
			const content = await fs.readFile(filePath, "utf-8");
			const project = JSON.parse(content);
			currentProjectPath = filePath;

			if (project && typeof project === "object") {
				const rawProject = project as { media?: unknown };
				const media = normalizeProjectMedia(rawProject.media);
				setCurrentRecordingSessionState(media ? { ...media, createdAt: Date.now() } : null);
			}

			return { success: true, path: filePath, project };
		} catch (error) {
			console.error("Failed to load project file:", error);
			return {
				success: false,
				message: mainT("dialogs", "ipc.failedToLoadProject"),
				error: String(error),
			};
		}
	});

	ipcMain.handle("load-current-project-file", async () => {
		try {
			if (!currentProjectPath) {
				return { success: false, message: mainT("dialogs", "ipc.noActiveProject") };
			}

			const content = await fs.readFile(currentProjectPath, "utf-8");
			const project = JSON.parse(content);

			if (project && typeof project === "object") {
				const rawProject = project as { media?: unknown };
				const media = normalizeProjectMedia(rawProject.media);
				setCurrentRecordingSessionState(media ? { ...media, createdAt: Date.now() } : null);
			}

			return { success: true, path: currentProjectPath, project };
		} catch (error) {
			console.error("Failed to load current project file:", error);
			return {
				success: false,
				message: mainT("dialogs", "ipc.failedToLoadCurrentProject"),
				error: String(error),
			};
		}
	});

	ipcMain.handle("get-current-recording-session", () => {
		const session = getCurrentRecordingSessionState();
		return session ? { success: true, session } : { success: false };
	});

	ipcMain.handle("set-current-recording-session", (_, session: RecordingSession | null) => {
		const normalized = normalizeRecordingSession(session);
		setCurrentRecordingSessionState(normalized);
		currentProjectPath = null;
		return { success: true, session: normalized ?? undefined };
	});

	ipcMain.handle("get-shortcuts", async () => {
		try {
			const data = await fs.readFile(SHORTCUTS_FILE, "utf-8");
			return JSON.parse(data);
		} catch {
			return null;
		}
	});

	ipcMain.handle("save-shortcuts", async (_, shortcuts: unknown) => {
		try {
			await fs.writeFile(SHORTCUTS_FILE, JSON.stringify(shortcuts, null, 2), "utf-8");
			return { success: true };
		} catch (error) {
			console.error("Failed to save shortcuts:", error);
			return { success: false, error: String(error) };
		}
	});
}
