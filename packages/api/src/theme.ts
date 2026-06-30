/**
 * Shared overlay theme — drives both the subathon timer capsule and the
 * rewards/goals card. Pure data + validation; the views map these choices to
 * their own geometry (a capsule vs a card map `corners` to different radii).
 */

export type ThemePreset = "brand" | "sunset" | "aurora" | "mono" | "custom";
export type ThemeFont = "montserrat" | "roboto" | "poppins" | "inter" | "system";
export type ThemeCorners = "rounded" | "pill" | "sharp";

export type OverlayTheme = {
	/** Gradient preset; `custom` uses `gradient`. */
	preset: ThemePreset;
	/** 2–6 hex stops, used only when `preset === "custom"`. */
	gradient: string[];
	/** `"auto"` = pick dark/white from gradient brightness; otherwise a hex. */
	textColor: string;
	/** Display font (Google fonts loaded app-wide). */
	font: ThemeFont;
	/** Corner style — `rounded` is the macOS-style default. */
	corners: ThemeCorners;
	/** Editable eyebrow text above the timer countdown (visibility = `showLabel`). */
	label: string;
	/** Show the eyebrow label ("SUBATHON" / "NEXT REWARD"). */
	showLabel: boolean;
	/** Show the timer status chip (play/pause). */
	showStatus: boolean;
	/** Show the pulsing live dot on the rewards card. */
	showLiveDot: boolean;
	/** Show the unit labels under the countdown digits (D/H/M/S). */
	showUnits: boolean;
	/** Show the rewards-card progress bar toward the next goal. */
	showProgressBar: boolean;
	/** Show the rewards-card "N Unlocked" row of already-won rewards. */
	showUnlocked: boolean;
};

/** Overlay-element visibility flags — the user-toggleable show/hide booleans. */
export const OVERLAY_TOGGLE_KEYS = [
	"showLabel",
	"showStatus",
	"showLiveDot",
	"showUnits",
	"showProgressBar",
	"showUnlocked",
] as const satisfies readonly (keyof OverlayTheme)[];

export const MAX_GRADIENT_STOPS = 6;
/** Matches `#abc` or `#aabbcc`. */
export const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Editable eyebrow text above the timer countdown. */
export const DEFAULT_TIMER_LABEL = "SUBATHON";
export const MAX_LABEL_LEN = 40;

/**
 * Normalize a hex colour to `#rrggbb`: expand `#rgb` shorthand, pass a 6-digit
 * value through unchanged, and fall back to brand blue for anything else.
 * `<input type="color">` and `${hex}aa` alpha suffixes both require 6 digits,
 * so every overlay/control surface expands through this single helper.
 */
export function expandHex(hex: string, fallback = "#00aced"): string {
	const v = hex.trim();
	const short = /^#([0-9a-fA-F]{3})$/.exec(v);
	if (short) {
		const [r, g, b] = short[1]!.split("");
		return `#${r}${r}${g}${g}${b}${b}`;
	}
	return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

/** Built-in capsule gradients. `brand` is the default (MrDemonWolf blue). */
export const THEME_PRESETS: Record<Exclude<ThemePreset, "custom">, string[]> = {
	brand: ["#0077c8", "#00aced", "#5bc8f0"],
	sunset: ["#ff4d97", "#b14df6", "#4d8bff", "#27d7f5"],
	aurora: ["#00e0a4", "#19b3c9", "#4d8bff"],
	mono: ["#8aa0bf", "#b9c8de", "#e2e8f0"],
};

export const THEME_PRESET_KEYS: ThemePreset[] = ["brand", "sunset", "aurora", "mono", "custom"];
export const THEME_FONTS: ThemeFont[] = ["montserrat", "roboto", "poppins", "inter", "system"];
export const THEME_CORNERS: ThemeCorners[] = ["rounded", "pill", "sharp"];

/** CSS font-family stacks. Google families are self-hosted via next/font and
 * exposed as CSS variables on `<body>` (see app/layout.tsx). */
export const FONT_STACKS: Record<ThemeFont, string> = {
	montserrat: "var(--font-montserrat), system-ui, sans-serif",
	roboto: "var(--font-roboto), system-ui, sans-serif",
	poppins: "var(--font-poppins), system-ui, sans-serif",
	inter: "var(--font-inter), system-ui, sans-serif",
	system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

/** Friendly labels for the font picker. */
export const FONT_LABELS: Record<ThemeFont, string> = {
	montserrat: "Montserrat",
	roboto: "Roboto",
	poppins: "Poppins",
	inter: "Inter",
	system: "System",
};

export function defaultOverlayTheme(): OverlayTheme {
	return {
		preset: "brand",
		gradient: [...THEME_PRESETS.brand],
		textColor: "auto",
		font: "montserrat",
		corners: "rounded",
		label: DEFAULT_TIMER_LABEL,
		showLabel: true,
		showStatus: true,
		showLiveDot: true,
		showUnits: true,
		showProgressBar: true,
		showUnlocked: true,
	};
}

/** Even-spread hex stops into a CSS linear-gradient (falls back to brand blue). */
export function gradientCss(stops: string[], angle = 100): string {
	const s = stops.length >= 2 ? stops : ["#00aced", "#5bc8f0"];
	const last = s.length - 1;
	return `linear-gradient(${angle}deg,${s.map((c, i) => `${c} ${Math.round((i / last) * 100)}%`).join(",")})`;
}

/** Concrete gradient stops for a theme — preset table, or the custom stops. */
export function resolveThemeGradient(theme: OverlayTheme): string[] {
	if (theme.preset === "custom") {
		return theme.gradient.length >= 2 ? theme.gradient : [...THEME_PRESETS.brand];
	}
	return [...THEME_PRESETS[theme.preset]];
}

/** Perceived brightness (0–255) of a #rgb / #rrggbb colour. */
export function luma(hex: string): number {
	const f = expandHex(hex).slice(1);
	const r = parseInt(f.slice(0, 2), 16);
	const g = parseInt(f.slice(2, 4), 16);
	const b = parseInt(f.slice(4, 6), 16);
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Resolve the text colour: explicit hex, or auto-picked from gradient brightness. */
export function resolveTextColor(theme: OverlayTheme): string {
	if (theme.textColor !== "auto" && HEX_COLOR.test(theme.textColor)) return theme.textColor;
	const stops = resolveThemeGradient(theme);
	const avg = stops.reduce((sum, c) => sum + luma(c), 0) / Math.max(1, stops.length);
	return avg > 150 ? "#04122b" : "#ffffff";
}

export type ThemeError = { path: string; message: string };

/**
 * Validate + normalize an arbitrary `theme` object, collecting errors. Missing
 * fields fall back to the brand default. Returns a complete OverlayTheme even on
 * error (the caller decides whether to use it based on `errors.length`).
 */
export function validateOverlayTheme(
	raw: unknown,
	errors: ThemeError[],
	at = "theme",
): OverlayTheme {
	const theme = defaultOverlayTheme();
	if (raw === undefined) return theme;
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		errors.push({ path: at, message: "must be an object" });
		return theme;
	}
	const t = raw as Record<string, unknown>;

	if (t.preset !== undefined) {
		if (typeof t.preset !== "string" || !THEME_PRESET_KEYS.includes(t.preset as ThemePreset)) {
			errors.push({
				path: `${at}.preset`,
				message: `must be one of ${THEME_PRESET_KEYS.join(", ")}`,
			});
		} else {
			theme.preset = t.preset as ThemePreset;
		}
	}

	if (t.gradient !== undefined) {
		if (!Array.isArray(t.gradient)) {
			errors.push({ path: `${at}.gradient`, message: "must be an array of hex colors" });
		} else if (t.gradient.length > MAX_GRADIENT_STOPS) {
			errors.push({ path: `${at}.gradient`, message: `max ${MAX_GRADIENT_STOPS} stops` });
		} else {
			const stops: string[] = [];
			t.gradient.forEach((c, i) => {
				if (typeof c !== "string" || !HEX_COLOR.test(c.trim())) {
					errors.push({
						path: `${at}.gradient[${i}]`,
						message: "must be a hex color like #00aced",
					});
				} else {
					stops.push(c.trim());
				}
			});
			theme.gradient = stops;
		}
	}
	if (theme.preset === "custom" && theme.gradient.length < 2) {
		errors.push({ path: `${at}.gradient`, message: "custom preset needs at least 2 hex stops" });
	}

	if (t.textColor !== undefined) {
		if (
			t.textColor === "auto" ||
			(typeof t.textColor === "string" && HEX_COLOR.test(t.textColor))
		) {
			theme.textColor = t.textColor;
		} else {
			errors.push({ path: `${at}.textColor`, message: 'must be "auto" or a hex color' });
		}
	}

	if (t.font !== undefined) {
		if (typeof t.font !== "string" || !THEME_FONTS.includes(t.font as ThemeFont)) {
			errors.push({ path: `${at}.font`, message: `must be one of ${THEME_FONTS.join(", ")}` });
		} else {
			theme.font = t.font as ThemeFont;
		}
	}

	if (t.corners !== undefined) {
		if (typeof t.corners !== "string" || !THEME_CORNERS.includes(t.corners as ThemeCorners)) {
			errors.push({ path: `${at}.corners`, message: `must be one of ${THEME_CORNERS.join(", ")}` });
		} else {
			theme.corners = t.corners as ThemeCorners;
		}
	}

	if (t.label !== undefined) {
		if (typeof t.label === "string") theme.label = t.label.trim().slice(0, MAX_LABEL_LEN);
		else errors.push({ path: `${at}.label`, message: "must be a string" });
	}

	// All the show/hide element toggles share one boolean shape.
	for (const key of OVERLAY_TOGGLE_KEYS) {
		if (t[key] === undefined) continue;
		if (typeof t[key] === "boolean") theme[key] = t[key] as boolean;
		else errors.push({ path: `${at}.${key}`, message: "must be a boolean" });
	}

	return theme;
}
