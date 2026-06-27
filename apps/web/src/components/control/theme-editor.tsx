"use client";

import {
	defaultOverlayTheme,
	expandHex,
	FONT_LABELS,
	FONT_STACKS,
	gradientCss,
	HEX_COLOR,
	MAX_GRADIENT_STOPS,
	type OverlayTheme,
	resolveTextColor,
	resolveThemeGradient,
	THEME_CORNERS,
	THEME_FONTS,
	THEME_PRESET_KEYS,
	THEME_PRESETS,
	type ThemeCorners,
	type ThemePreset,
} from "@wolfathon/api/theme";
import { Button } from "@wolfathon/ui/components/button";
import { Checkbox } from "@wolfathon/ui/components/checkbox";
import { Plus, RotateCcw, X } from "lucide-react";
import { useId } from "react";

const PRESET_LABELS: Record<ThemePreset, string> = {
	brand: "Brand",
	sunset: "Sunset",
	aurora: "Aurora",
	mono: "Mono",
	custom: "Custom",
};

const CORNER_LABELS: Record<ThemeCorners, string> = {
	rounded: "Rounded",
	pill: "Pill",
	sharp: "Sharp",
};

const CORNER_PREVIEW: Record<ThemeCorners, string> = {
	rounded: "rounded-lg",
	pill: "rounded-full",
	sharp: "rounded-[2px]",
};

/**
 * Shared overlay theme editor (timer + rewards). Controlled: holds no state,
 * just renders `theme` and calls `onChange` with the next theme.
 */
export function ThemeEditor({
	theme,
	onChange,
	labelToggleText = "Show eyebrow label",
	statusToggleText = "Show status indicator",
}: {
	theme: OverlayTheme;
	onChange: (t: OverlayTheme) => void;
	labelToggleText?: string;
	statusToggleText?: string;
}) {
	const stops = resolveThemeGradient(theme);
	const autoText = theme.textColor === "auto";

	function selectPreset(p: ThemePreset) {
		if (p === "custom") {
			const seed = theme.gradient.length >= 2 ? theme.gradient : resolveThemeGradient(theme);
			onChange({ ...theme, preset: "custom", gradient: seed.map((c) => expandHex(c)) });
		} else {
			onChange({ ...theme, preset: p });
		}
	}

	function setStop(i: number, color: string) {
		const g = [...theme.gradient];
		g[i] = color;
		onChange({ ...theme, gradient: g });
	}

	return (
		<div className="mt-5">
			<div className="flex items-center justify-between">
				<div className="text-sm font-medium">Overlay theme</div>
				<Button
					variant="ghost"
					size="sm"
					className="rounded-lg"
					onClick={() => onChange(defaultOverlayTheme())}
				>
					<RotateCcw className="size-3.5" />
					Reset
				</Button>
			</div>
			<p className="mt-1 text-xs text-muted-foreground">
				Colour, text, font and corners. Brand blue, Montserrat, macOS-rounded by default.
			</p>

			{/* live swatch — sample reward text on the gradient so the operator can
			    judge legibility with the exact colour/font the overlay uses. */}
			<div
				className={`mt-2 flex w-full items-center justify-center px-4 py-2.5 ring-1 ring-border ${CORNER_PREVIEW[theme.corners]}`}
				style={{ backgroundImage: gradientCss(stops) }}
			>
				<span
					className="truncate text-base font-semibold"
					style={{ color: resolveTextColor(theme), fontFamily: FONT_STACKS[theme.font] }}
				>
					Next reward
				</span>
			</div>

			{/* preset buttons — auto-fit so they never cram in the narrow panel */}
			<div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(4.5rem,1fr))]">
				{THEME_PRESET_KEYS.map((p) => {
					const sw =
						p === "custom"
							? theme.gradient.length >= 2
								? theme.gradient
								: stops
							: THEME_PRESETS[p];
					const active = theme.preset === p;
					return (
						<button
							key={p}
							type="button"
							onClick={() => selectPreset(p)}
							className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition ${
								active
									? "border-primary/60 bg-primary/10"
									: "border-border hover:border-primary/40 hover:bg-accent"
							}`}
						>
							<span
								className="h-4 w-full rounded-full"
								style={{ backgroundImage: gradientCss(sw) }}
							/>
							{PRESET_LABELS[p]}
						</button>
					);
				})}
			</div>

			{/* custom stops */}
			{theme.preset === "custom" && (
				<div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
					<div className="flex items-center justify-between">
						<div className="text-xs font-medium">
							Gradient stops{" "}
							<span className="text-muted-foreground">
								({theme.gradient.length}/{MAX_GRADIENT_STOPS})
							</span>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="rounded-lg"
							disabled={theme.gradient.length >= MAX_GRADIENT_STOPS}
							onClick={() =>
								onChange({
									...theme,
									gradient: [...theme.gradient, theme.gradient.at(-1) ?? "#00aced"],
								})
							}
						>
							<Plus className="size-3.5" />
							Add stop
						</Button>
					</div>
					<div className="mt-2 flex flex-wrap gap-2">
						{theme.gradient.map((c, i) => (
							<div
								key={i}
								className="flex items-center gap-1 rounded-lg border border-border bg-background p-1"
							>
								<input
									type="color"
									aria-label={`Stop ${i + 1} colour`}
									value={expandHex(c)}
									onChange={(e) => setStop(i, e.target.value)}
									className="size-8 cursor-pointer rounded border-0 bg-transparent p-0"
								/>
								<span className="px-1 font-mono text-xs text-muted-foreground">{c}</span>
								<button
									type="button"
									aria-label={`Remove stop ${i + 1}`}
									disabled={theme.gradient.length <= 2}
									className="grid size-9 place-items-center rounded text-muted-foreground transition hover:text-destructive disabled:opacity-30"
									onClick={() =>
										onChange({ ...theme, gradient: theme.gradient.filter((_, j) => j !== i) })
									}
								>
									<X className="size-3.5" />
								</button>
							</div>
						))}
					</div>
				</div>
			)}

			{/* text colour */}
			<div className="mt-4">
				<div className="text-xs font-medium">Text colour</div>
				<div className="mt-2 flex flex-wrap items-center gap-3">
					<Toggle
						checked={autoText}
						onChange={(v) =>
							onChange({ ...theme, textColor: v ? "auto" : resolveTextColor(theme) })
						}
						label="Auto (match background)"
					/>
					{!autoText && (
						<div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
							<input
								type="color"
								aria-label="Text colour"
								value={HEX_COLOR.test(theme.textColor) ? expandHex(theme.textColor) : "#ffffff"}
								onChange={(e) => onChange({ ...theme, textColor: e.target.value })}
								className="size-8 cursor-pointer rounded border-0 bg-transparent p-0"
							/>
							<span className="px-1 font-mono text-xs text-muted-foreground">
								{theme.textColor}
							</span>
						</div>
					)}
				</div>
			</div>

			{/* font picker */}
			<div className="mt-4">
				<div className="text-xs font-medium">Font</div>
				<div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(5rem,1fr))]">
					{THEME_FONTS.map((f) => {
						const active = theme.font === f;
						return (
							<button
								key={f}
								type="button"
								onClick={() => onChange({ ...theme, font: f })}
								style={{ fontFamily: FONT_STACKS[f] }}
								className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${
									active
										? "border-primary/60 bg-primary/10"
										: "border-border hover:border-primary/40 hover:bg-accent"
								}`}
							>
								{FONT_LABELS[f]}
							</button>
						);
					})}
				</div>
			</div>

			{/* corners */}
			<div className="mt-4">
				<div className="text-xs font-medium">Corners</div>
				<div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(6rem,1fr))]">
					{THEME_CORNERS.map((c) => {
						const active = theme.corners === c;
						return (
							<button
								key={c}
								type="button"
								onClick={() => onChange({ ...theme, corners: c })}
								className={`flex items-center justify-center gap-2 rounded-lg border px-2 py-2 text-xs font-medium transition ${
									active
										? "border-primary/60 bg-primary/10"
										: "border-border hover:border-primary/40 hover:bg-accent"
								}`}
							>
								<span className={`size-4 border-2 border-current ${CORNER_PREVIEW[c]}`} />
								{CORNER_LABELS[c]}
							</button>
						);
					})}
				</div>
			</div>

			{/* chrome toggles */}
			<div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
				<Toggle
					checked={theme.showLabel}
					onChange={(v) => onChange({ ...theme, showLabel: v })}
					label={labelToggleText}
				/>
				<Toggle
					checked={theme.showStatus}
					onChange={(v) => onChange({ ...theme, showStatus: v })}
					label={statusToggleText}
				/>
			</div>
		</div>
	);
}

function Toggle({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
}) {
	// htmlFor → the Checkbox button (a labelable element) so clicking the text toggles.
	const id = useId();
	return (
		<div className="flex items-center gap-2 text-xs text-muted-foreground">
			<Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
			<label htmlFor={id} className="cursor-pointer">
				{label}
			</label>
		</div>
	);
}
