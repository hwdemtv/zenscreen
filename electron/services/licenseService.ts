import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "dotenv";
import { app } from "electron";

config(); // Load .env configuration

const LICENSE_SERVER_URLS = (process.env.LICENSE_SERVER_URLS || "").split(",").filter(Boolean);

// TODO: Replace with the actual production RSA public key provided by hw-license-center
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxxx
YOUR_PRODUCTION_PUBLIC_KEY_HERE
XXX-----END PUBLIC KEY-----`;

// Check if we're in development mode (placeholder key)
const IS_DEVELOPMENT_MODE = PUBLIC_KEY.includes("YOUR_PRODUCTION_PUBLIC_KEY_HERE");

export interface LicenseStatus {
	isPro: boolean;
	machineId: string;
	validUntil: number | null;
	plan: string;
	error?: string;
}

export class LicenseService {
	private currentToken: string | null = null;
	private currentLicenseKey: string | null = null;
	private cachedStatus: LicenseStatus | null = null;
	private initialized = false;

	private get licensePath(): string {
		return path.join(app.getPath("userData"), "license.key");
	}

	public getMachineId(): string {
		const interfaces = os.networkInterfaces();
		let macAddress = "";

		// Find first non-internal MAC address
		for (const name of Object.keys(interfaces)) {
			const iface = interfaces[name];
			if (!iface) continue;
			for (const config of iface) {
				if (!config.internal && config.mac && config.mac !== "00:00:00:00:00:00") {
					macAddress = config.mac;
					break;
				}
			}
			if (macAddress) break;
		}

		// Fallback if no network interface found
		if (!macAddress) {
			macAddress = "unknown-device-" + os.hostname();
		}

		// Hash it to create a cleaner, uniform machine ID
		return crypto
			.createHash("sha256")
			.update(macAddress)
			.digest("hex")
			.substring(0, 16)
			.toUpperCase();
	}

	public async initialize(): Promise<void> {
		if (this.initialized) return;
		try {
			const content = await fs.readFile(this.licensePath, "utf-8");
			try {
				const data = JSON.parse(content);
				this.currentLicenseKey = data.licenseKey || null;
				this.currentToken = data.token || null;
			} catch (err) {
				// Fallback for legacy raw token format
				this.currentToken = content.trim();
				this.currentLicenseKey = null;
			}
		} catch (e) {
			// No license file found, which is expected for free users
		}
		this.initialized = true;

		// Perform silent sync in background
		if (this.currentLicenseKey) {
			this.syncLicenseStatus().catch((err) =>
				console.error("[LicenseService] Silent sync failed", err),
			);
		}
	}

	public getStatus(): LicenseStatus {
		if (!this.initialized) {
			console.warn("[LicenseService] getStatus() called before initialize()");
		}

		if (this.cachedStatus) return this.cachedStatus;

		const machineId = this.getMachineId();
		if (!this.currentToken) {
			return { isPro: false, machineId, validUntil: null, plan: "Free" };
		}

		this.cachedStatus = this.verifyToken(this.currentToken);
		return this.cachedStatus;
	}

	public async applyLicense(key: string): Promise<LicenseStatus> {
		const trimmedKey = key.trim();
		let tokenToVerify = trimmedKey;
		let actualKey = trimmedKey;

		try {
			const fetchedToken = await this.fetchTokenWithKey(trimmedKey, this.getMachineId());
			if (fetchedToken) {
				tokenToVerify = fetchedToken;
			} else if (trimmedKey.split(".").length === 3) {
				console.log(
					"[LicenseService] Network check skipped or failed, falling back to raw JWT evaluation.",
				);
				actualKey = ""; // Raw token provided, no actual license key
			} else {
				return {
					...this.verifyToken(""),
					error: "Failed to connect to license server and the input is not a valid JWT.",
				};
			}
		} catch (err: any) {
			if (err.message?.startsWith("REJECTED:")) {
				return { ...this.verifyToken(""), error: err.message.replace("REJECTED:", "") };
			}
			if (trimmedKey.split(".").length !== 3) {
				return {
					...this.verifyToken(""),
					error: "Network error while connecting to license servers.",
				};
			}
		}

		const status = this.verifyToken(tokenToVerify);
		if (status.isPro) {
			this.currentToken = tokenToVerify;
			this.currentLicenseKey = actualKey;
			this.cachedStatus = status;
			// Persist the combined format
			try {
				const saveData = JSON.stringify({
					licenseKey: this.currentLicenseKey,
					token: this.currentToken,
				});
				await fs.writeFile(this.licensePath, saveData, "utf-8");
			} catch (e) {
				console.error("[LicenseService] Failed to persist license:", e);
			}
		}
		return status;
	}

	public async removeLicense(): Promise<void> {
		this.currentToken = null;
		this.currentLicenseKey = null;
		this.cachedStatus = null;
		try {
			await fs.unlink(this.licensePath);
		} catch (e) {
			// Ignore if file does not exist
		}
	}

	public async syncLicenseStatus(): Promise<void> {
		if (!this.currentLicenseKey) return;

		try {
			const newToken = await this.fetchTokenWithKey(this.currentLicenseKey, this.getMachineId());
			if (newToken) {
				const status = this.verifyToken(newToken);
				if (status.isPro) {
					this.currentToken = newToken;
					this.cachedStatus = status;
					const saveData = JSON.stringify({
						licenseKey: this.currentLicenseKey,
						token: this.currentToken,
					});
					await fs.writeFile(this.licensePath, saveData, "utf-8");
				} else {
					await this.removeLicense();
				}
			}
		} catch (err: any) {
			if (err.message?.startsWith("REJECTED:")) {
				console.warn(
					"[LicenseService] Silent sync rejected by server. Revoking local license.",
					err.message,
				);
				await this.removeLicense();
			}
		}
	}

	private async fetchTokenWithKey(key: string, machineId: string): Promise<string | null> {
		if (LICENSE_SERVER_URLS.length === 0) return null;

		const payload = {
			license_key: key,
			device_id: machineId,
			device_name: os.hostname(),
		};

		for (const serverUrl of LICENSE_SERVER_URLS) {
			try {
				const url = serverUrl.replace(/\/$/, "") + "/api/v1/auth/verify";
				const response = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
					signal: AbortSignal.timeout(8000), // 8 seconds timeout per server
				});

				const data = await response.json().catch(() => null);

				if (!response.ok || (data && data.success === false)) {
					const msg = data?.msg || data?.error || "Verification rejected by server";
					throw new Error(`REJECTED:${msg}`);
				}

				if (data && data.success && data.token) {
					return data.token;
				}
			} catch (err: any) {
				if (err.message?.startsWith("REJECTED:")) throw err;
				console.warn(`[LicenseService] Failed to reach ${serverUrl}:`, err.message);
				continue;
			}
		}
		return null;
	}

	private verifyToken(token: string): LicenseStatus {
		const machineId = this.getMachineId();
		const defaultStatus: LicenseStatus = {
			isPro: false,
			machineId,
			validUntil: null,
			plan: "Free",
			error: "Invalid token",
		};

		// Basic format check
		if (!token || typeof token !== "string") {
			return { ...defaultStatus, error: "Token is empty or invalid" };
		}

		try {
			const parts = token.split(".");
			if (parts.length !== 3) {
				return { ...defaultStatus, error: "Malformed signature format" };
			}

			const [headerB64, payloadB64, signatureB64] = parts;

			// Verify signature (skip in development mode)
			if (IS_DEVELOPMENT_MODE) {
				console.warn("[LicenseService] Development mode: bypassing signature verification");
			} else {
				const isValid = crypto
					.createVerify("RSA-SHA256")
					.update(headerB64 + "." + payloadB64)
					.verify(PUBLIC_KEY, signatureB64, "base64url");

				if (!isValid) {
					return { ...defaultStatus, error: "Signature verification failed" };
				}
			}

			// Decode payload
			const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
			const payload = JSON.parse(payloadStr);

			// Validate payload structure
			if (typeof payload !== "object" || payload === null) {
				return { ...defaultStatus, error: "Invalid payload structure" };
			}

			// Check expiration
			if (payload.exp) {
				const now = Math.floor(Date.now() / 1000);
				if (now > payload.exp) {
					return { ...defaultStatus, error: "License has expired" };
				}
			}

			// Check machine ID binding
			if (payload.machineId && payload.machineId !== machineId) {
				return { ...defaultStatus, error: "License is bound to another device" };
			}

			return {
				isPro: true,
				machineId,
				validUntil: payload.exp ? payload.exp * 1000 : null,
				plan: payload.plan || "Pro",
			};
		} catch (error) {
			console.error("[LicenseService] Token verification failed:", error);
			return { ...defaultStatus, error: "Verification encountered an error" };
		}
	}
}

// Singleton instance
export const licenseService = new LicenseService();
