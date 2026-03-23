import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useScopedT } from "@/contexts/I18nContext";
import {
	GIF_FRAME_RATES,
	GIF_SIZE_PRESETS,
	type GifFrameRate,
	type GifSizePreset,
} from "@/lib/exporter/types";

interface GifOptionsPanelProps {
	frameRate: GifFrameRate;
	onFrameRateChange: (rate: GifFrameRate) => void;
	loop: boolean;
	onLoopChange: (loop: boolean) => void;
	sizePreset: GifSizePreset;
	onSizePresetChange: (preset: GifSizePreset) => void;
	outputDimensions: { width: number; height: number };
	disabled?: boolean;
}

const SIZE_PRESET_KEYS: Record<GifSizePreset, string> = {
	medium: "gifSettings.sizePresets.medium",
	large: "gifSettings.sizePresets.large",
	original: "gifSettings.sizePresets.original",
};

const FRAME_RATE_KEYS: Record<GifFrameRate, string> = {
	15: "gifSettings.frameRates.fps15",
	20: "gifSettings.frameRates.fps20",
	25: "gifSettings.frameRates.fps25",
	30: "gifSettings.frameRates.fps30",
};

export function GifOptionsPanel({
	frameRate,
	onFrameRateChange,
	loop,
	onLoopChange,
	sizePreset,
	onSizePresetChange,
	outputDimensions,
	disabled = false,
}: GifOptionsPanelProps) {
	const t = useScopedT("settings");

	const sizePresetOptions = Object.keys(GIF_SIZE_PRESETS).map((key) => ({
		value: key as GifSizePreset,
		label: t(SIZE_PRESET_KEYS[key as GifSizePreset]),
	}));

	const frameRateOptions = GIF_FRAME_RATES.map((rate) => ({
		value: rate.value,
		label: t(FRAME_RATE_KEYS[rate.value]),
	}));

	return (
		<div className="space-y-4 animate-in slide-in-from-bottom-2 duration-200">
			{/* Frame Rate */}
			<div className="space-y-2">
				<label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
					{t("gifSettings.frameRateLabel")}
				</label>
				<Select
					value={String(frameRate)}
					onValueChange={(value) => onFrameRateChange(Number(value) as GifFrameRate)}
					disabled={disabled}
				>
					<SelectTrigger className="w-full bg-white/5 border-white/10 text-slate-200 hover:bg-white/10">
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="bg-[#1a1a1f] border-white/10 z-[100]">
						{frameRateOptions.map((option) => (
							<SelectItem
								key={option.value}
								value={String(option.value)}
								className="text-slate-200 focus:bg-white/10 focus:text-white"
							>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Size Preset */}
			<div className="space-y-2">
				<label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
					{t("gifSettings.outputSize")}
				</label>
				<Select
					value={sizePreset}
					onValueChange={(value) => onSizePresetChange(value as GifSizePreset)}
					disabled={disabled}
				>
					<SelectTrigger className="w-full bg-white/5 border-white/10 text-slate-200 hover:bg-white/10">
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="bg-[#1a1a1f] border-white/10 z-[100]">
						{sizePresetOptions.map((option) => (
							<SelectItem
								key={option.value}
								value={option.value}
								className="text-slate-200 focus:bg-white/10 focus:text-white"
							>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="text-xs text-slate-500">
					{outputDimensions.width} × {outputDimensions.height}px
				</div>
			</div>

			{/* Loop Toggle */}
			<div className="flex items-center justify-between py-2">
				<div>
					<label className="text-sm font-medium text-slate-200">
						{t("gifSettings.loopAnimation")}
					</label>
					<p className="text-xs text-slate-500">{t("gifSettings.loopAnimationDescription")}</p>
				</div>
				<Switch checked={loop} onCheckedChange={onLoopChange} disabled={disabled} />
			</div>
		</div>
	);
}
