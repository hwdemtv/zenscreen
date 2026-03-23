import { CheckCircle2, ChevronRight, Copy, KeyRound, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import { useLicenseStore } from "@/store/licenseStore";

export function LicenseDialog() {
	const { status, isLoading, activateLicense, removeLicense, refreshStatus } = useLicenseStore();
	const [tokenInput, setTokenInput] = useState("");
	const [isActivating, setIsActivating] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const t = useScopedT("license");

	useEffect(() => {
		if (isOpen) {
			refreshStatus();
		}
	}, [isOpen, refreshStatus]);

	const handleCopyMachineId = () => {
		if (status?.machineId) {
			navigator.clipboard.writeText(status.machineId);
			toast.success(t("feedback.machineIdCopied"));
		}
	};

	const handleActivate = async () => {
		if (!tokenInput.trim()) return;
		setIsActivating(true);

		const success = await activateLicense(tokenInput.trim());
		if (success) {
			toast.success(t("feedback.upgradeSuccess"));
			setIsOpen(false);
			setTokenInput("");
		} else {
			const err = useLicenseStore.getState().error;
			toast.error(err || t("feedback.activateFailed"));
		}

		setIsActivating(false);
	};

	const handleRemove = async () => {
		await removeLicense();
		toast.success(t("feedback.licenseRemoved"));
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{status?.isPro ? (
					<Button
						variant="ghost"
						size="sm"
						className="h-8 gap-1.5 text-[#34B27B] hover:text-[#34B27B] hover:bg-[#34B27B]/10"
					>
						<Sparkles className="w-4 h-4" />
						{t("badge.pro")}
					</Button>
				) : (
					<Button variant="ghost" size="sm" className="h-8 gap-1.5 text-zinc-400 hover:text-white">
						<KeyRound className="w-4 h-4" />
						{t("badge.upgrade")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px] bg-[#09090b] border-white/10 text-slate-200">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-xl font-medium">
						<KeyRound className="w-5 h-5 text-[#34B27B]" />
						{status?.isPro ? t("title.proLicenseActive") : t("title.activatePro")}
					</DialogTitle>
					<DialogDescription className="text-slate-400">
						{status?.isPro ? t("description.active") : t("description.inactive")}
					</DialogDescription>
				</DialogHeader>

				<div className="py-4 space-y-4">
					{isLoading ? (
						<div className="flex items-center justify-center py-6">
							<Loader2 className="w-6 h-6 animate-spin text-slate-500" />
						</div>
					) : status?.isPro ? (
						<div className="space-y-4">
							<div className="p-4 rounded-lg bg-[#34B27B]/10 border border-[#34B27B]/20 flex flex-col items-center gap-2 text-center">
								<CheckCircle2 className="w-10 h-10 text-[#34B27B]" />
								<div className="font-semibold text-white">
									ZenScreen Pro {status.plan ? `(${status.plan})` : ""}
								</div>
								<div className="text-xs text-slate-400">
									{t("status.validUntil")}:{" "}
									{status.validUntil
										? new Date(status.validUntil).toLocaleDateString()
										: t("status.lifetime")}
								</div>
							</div>

							<div className="space-y-2">
								<div className="text-sm font-medium text-slate-300">{t("fields.deviceId")}</div>
								<div className="flex items-center gap-2">
									<code className="flex-1 px-3 py-2 rounded-md bg-black/40 border border-white/5 font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap text-slate-400">
										{status.machineId}
									</code>
									<Button
										variant="outline"
										size="sm"
										className="bg-transparent border-white/10 h-8 w-8 p-0"
										onClick={handleCopyMachineId}
									>
										<Copy className="w-3.5 h-3.5" />
									</Button>
								</div>
							</div>

							<Button
								variant="destructive"
								className="w-full h-9 bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20"
								onClick={handleRemove}
							>
								{t("actions.removeLicense")}
							</Button>
						</div>
					) : (
						<div className="space-y-4">
							<div className="space-y-2">
								<div className="text-sm font-medium text-slate-300 flex items-center justify-between">
									<span>{t("fields.hardwareFingerprint")}</span>
									<span className="text-xs text-slate-500">
										{t("fields.provideWhenPurchasing")}
									</span>
								</div>
								<div className="flex items-center gap-2">
									<code className="flex-1 px-3 py-2 rounded-md bg-black/40 border border-white/5 font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap text-[#34B27B]/80">
										{status?.machineId || t("feedback.loading")}
									</code>
									<Button
										variant="outline"
										size="sm"
										className="bg-transparent border-white/10 hover:bg-white/5 h-8 w-8 p-0"
										disabled={!status?.machineId}
										onClick={handleCopyMachineId}
									>
										<Copy className="w-3.5 h-3.5 text-slate-300" />
									</Button>
								</div>
							</div>

							<div className="space-y-2 pt-2">
								<div className="text-sm font-medium text-slate-300">
									{t("fields.activationToken")}
								</div>
								<textarea
									placeholder={t("fields.tokenPlaceholder")}
									className="flex min-h-[80px] w-full rounded-md border border-input px-3 py-2 text-sm shadow-sm bg-black/40 border-white/10 font-mono text-xs placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#34B27B] text-slate-300 transition-colors"
									autoFocus
									value={tokenInput}
									onChange={(e) => setTokenInput(e.target.value)}
								/>
							</div>

							<Button
								className="w-full gap-2 bg-[#34B27B] hover:bg-[#2da06e] text-white"
								onClick={handleActivate}
								disabled={isActivating || !tokenInput.trim()}
							>
								{isActivating ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<ChevronRight className="w-4 h-4" />
								)}
								{t("actions.activate")}
							</Button>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
