interface AudioLevelMeterProps {
	level: number; // 0-100
	className?: string;
}

const bars = [
	{ threshold: 5, height: "35%", color: "rgba(34, 197, 94, 0.4)" }, // Emerald-500
	{ threshold: 20, height: "50%", color: "rgba(34, 197, 94, 0.6)" },
	{ threshold: 45, height: "65%", color: "rgba(34, 197, 94, 0.8)" },
	{ threshold: 70, height: "80%", color: "rgba(234, 179, 8, 0.9)" }, // Yellow-500
	{ threshold: 90, height: "98%", color: "rgba(239, 68, 68, 1)" }, // Red-500
];

export function AudioLevelMeter({ level, className = "" }: AudioLevelMeterProps) {
	return (
		<div className={`flex items-end justify-between gap-1 h-5 ${className}`}>
			{bars.map((bar, index) => {
				const isActive = level >= bar.threshold;
				return (
					<div
						key={index}
						className="flex-1 transition-all duration-75 ease-out"
						style={{
							height: isActive ? bar.height : "15%",
							background: isActive ? bar.color : "rgba(255, 255, 255, 0.1)",
							opacity: isActive ? 1 : 0.3,
							clipPath: "polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)",
							filter: isActive ? `drop-shadow(0 0 4px ${bar.color})` : "none",
							boxShadow: isActive ? `0 0 8px ${bar.color}` : "none",
						}}
					/>
				);
			})}
		</div>
	);
}
