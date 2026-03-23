import { BrowserWindow } from "electron";
import { registerMediaHandlers } from "./mediaHandlers";
import { registerProjectHandlers } from "./projectHandlers";
import { registerSystemHandlers } from "./systemHandlers";

/**
 * IPC Handlers for ZenScreen
 *
 * This file now acts as a central registry for specialized IPC modules.
 */
export function registerIpcHandlers(
	createEditorWindow: () => void,
	createSourceSelectorWindow: () => BrowserWindow,
	getMainWindow: () => BrowserWindow | null,
	getSourceSelectorWindow: () => BrowserWindow | null,
	onRecordingStateChange?: (recording: boolean, sourceName: string) => void,
) {
	// Register Media Handlers (Recording, Camera, Telemetry)
	registerMediaHandlers(
		getMainWindow,
		getSourceSelectorWindow,
		createEditorWindow,
		createSourceSelectorWindow,
		onRecordingStateChange,
	);

	// Register Project Handlers (Save/Load Project, Shortcuts)
	registerProjectHandlers();

	// Register System Handlers (External URLs, File Dialogs, Shell)
	registerSystemHandlers();
}
