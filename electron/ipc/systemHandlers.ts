import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, dialog, ipcMain, shell } from "electron";
import { mainT } from "../i18n";
import { RECORDINGS_DIR } from "../main";
import { licenseService } from "../services/licenseService";

export function registerSystemHandlers() {
	ipcMain.handle("get-platform", () => {
		return process.platform;
	});

	ipcMain.handle("open-external-url", async (_, url: string) => {
		try {
			const parsedUrl = new URL(url);
			if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
				throw new Error(`Invalid protocol: ${parsedUrl.protocol}`);
			}
			await shell.openExternal(url);
			return { success: true };
		} catch (error) {
			console.error("Failed to open URL:", error);
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("get-asset-base-path", () => {
		try {
			if (app.isPackaged) {
				const assetPath = path.join(process.resourcesPath, "assets");
				return pathToFileURL(`${assetPath}${path.sep}`).toString();
			}
			const assetPath = path.join(app.getAppPath(), "public", "assets");
			return pathToFileURL(`${assetPath}${path.sep}`).toString();
		} catch (err) {
			console.error("Failed to resolve asset base path:", err);
			return null;
		}
	});

	ipcMain.handle("reveal-in-folder", async (_, filePath: string) => {
		try {
			shell.showItemInFolder(filePath);
			return { success: true };
		} catch (error) {
			console.error(`Error revealing item in folder: ${filePath}`, error);
			try {
				const openPathResult = await shell.openPath(path.dirname(filePath));
				if (openPathResult) {
					return { success: false, error: openPathResult };
				}
				return { success: true, message: "Could not reveal item, but opened directory." };
			} catch (openError) {
				console.error(`Error opening directory: ${path.dirname(filePath)}`, openError);
				return { success: false, error: String(error) };
			}
		}
	});

	ipcMain.handle("read-binary-file", async (_, inputPath: string) => {
		try {
			// Helper to normalize path within this scope
			const normalizeVideoSourcePath = (v?: string | null) => {
				if (typeof v !== "string") return null;
				return v.trim();
			};

			const normalizedPath = normalizeVideoSourcePath(inputPath);
			if (!normalizedPath) {
				return { success: false, message: mainT("dialogs", "ipc.invalidFilePath") };
			}

			// Security: Only allow files from RECORDINGS_DIR or app data
			const absolutePath = path.normalize(normalizedPath);
			const allowedPaths = [RECORDINGS_DIR, app.getPath("userData"), app.getAppPath()];

			const isAllowed = allowedPaths.some((allowed) => absolutePath.startsWith(allowed));
			if (!isAllowed) {
				console.error("Access denied to binary file:", absolutePath);
				return { success: false, message: mainT("dialogs", "ipc.accessDenied") };
			}

			const data = await fs.readFile(absolutePath);
			return {
				success: true,
				data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
				path: absolutePath,
			};
		} catch (error) {
			console.error("Failed to read binary file:", error);
			return {
				success: false,
				message: mainT("dialogs", "ipc.failedToReadFile"),
				error: String(error),
			};
		}
	});

	ipcMain.handle("save-exported-video", async (_, videoData: ArrayBuffer, fileName: string) => {
		try {
			const isGif = fileName.toLowerCase().endsWith(".gif");
			const filters = isGif
				? [{ name: mainT("dialogs", "fileDialogs.gifImage"), extensions: ["gif"] }]
				: [{ name: mainT("dialogs", "fileDialogs.mp4Video"), extensions: ["mp4"] }];

			const result = await dialog.showSaveDialog({
				title: isGif
					? mainT("dialogs", "fileDialogs.saveGif")
					: mainT("dialogs", "fileDialogs.saveVideo"),
				defaultPath: path.join(app.getPath("downloads"), fileName),
				filters,
				properties: ["createDirectory", "showOverwriteConfirmation"],
			});

			if (result.canceled || !result.filePath) {
				return { success: false, canceled: true, message: mainT("dialogs", "ipc.exportCanceled") };
			}

			await fs.writeFile(result.filePath, Buffer.from(videoData));

			// Automatically reveal the file in the folder after successful export
			try {
				shell.showItemInFolder(result.filePath);
			} catch (revealError) {
				console.error("Failed to reveal exported file:", revealError);
			}

			return {
				success: true,
				path: result.filePath,
				message: mainT("dialogs", "ipc.videoExported"),
			};
		} catch (error) {
			console.error("Failed to save exported video:", error);
			return {
				success: false,
				message: mainT("dialogs", "ipc.failedToSaveVideo"),
				error: String(error),
			};
		}
	});

	ipcMain.handle("get-license-status", () => {
		return licenseService.getStatus();
	});

	ipcMain.handle("verify-license", async (_, token: string) => {
		return await licenseService.applyLicense(token);
	});

	ipcMain.handle("remove-license", async () => {
		await licenseService.removeLicense();
		return { success: true };
	});
}
