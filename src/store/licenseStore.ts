import { create } from "zustand";
import type { LicenseStatus } from "../../electron/services/licenseService";

interface LicenseStore {
	status: LicenseStatus | null;
	isLoading: boolean;
	error: string | null;
	refreshStatus: () => Promise<void>;
	activateLicense: (token: string) => Promise<boolean>;
	removeLicense: () => Promise<void>;
	clearError: () => void;
}

// Default fallback status for error cases
const getDefaultStatus = (): LicenseStatus => ({
	isPro: false,
	machineId: "",
	validUntil: null,
	plan: "Free",
	error: "Failed to fetch license status",
});

export const useLicenseStore = create<LicenseStore>((set, get) => ({
	status: null,
	isLoading: true,
	error: null,

	refreshStatus: async () => {
		set({ isLoading: true, error: null });
		try {
			const status = await window.electronAPI.getLicenseStatus();
			set({ status, isLoading: false, error: null });
		} catch (err) {
			console.error("[LicenseStore] Failed to refresh status:", err);
			set({
				status: getDefaultStatus(),
				error: String(err),
				isLoading: false,
			});
		}
	},

	activateLicense: async (token: string) => {
		set({ isLoading: true, error: null });
		try {
			const status = await window.electronAPI.verifyLicense(token);
			if (status.error) {
				set({ status, isLoading: false, error: status.error });
				return false;
			}
			set({ status, isLoading: false, error: null });
			return status.isPro;
		} catch (err) {
			console.error("[LicenseStore] Failed to activate license:", err);
			set({
				status: getDefaultStatus(),
				error: String(err),
				isLoading: false,
			});
			return false;
		}
	},

	removeLicense: async () => {
		set({ isLoading: true, error: null });
		try {
			await window.electronAPI.removeLicense();
			await get().refreshStatus();
		} catch (err) {
			console.error("[LicenseStore] Failed to remove license:", err);
			set({ error: String(err), isLoading: false });
		}
	},

	clearError: () => {
		set({ error: null });
	},
}));
