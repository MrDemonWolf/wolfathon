/**
 * Domain logic for the Wolfathon tracker.
 *
 * One rule governs this whole file: `reward` is the only goal field that may
 * ever reach the overlay. `note` is internal (e.g. "10 subs") and is stripped
 * server-side by {@link stripNotes} before any public response.
 */

/** A goal as stored internally (includes the private `note`). */
export type Goal = {
	id: string;
	reward: string;
	note?: string;
	unlocked: boolean;
};

/** The full tracker document, stored as JSON in the single DB row. */
export type Data = {
	goals: Goal[];
	/** Index of the next goal to unlock (== number of unlocked goals at the front). */
	currentIndex: number;
};

/** A goal as sent to the overlay — note removed. */
export type PublicGoal = Omit<Goal, "note">;

/** The tracker document as sent to the overlay — notes removed. */
export type PublicData = {
	goals: PublicGoal[];
	currentIndex: number;
};

/** A single import validation failure. `index` is the goal row, or -1 for document-level errors. */
export type ImportError = { index: number; message: string };

export type ImportResult =
	| { ok: true; data: Data; rewards: string[] }
	| { ok: false; errors: ImportError[] };

export const MAX_GOALS = 50;
export const MAX_REWARD_LENGTH = 80;

/** Sample goals pre-seeded into a fresh database (mirrors the README example). */
const SAMPLE_GOALS: { reward: string; note: string }[] = [
	{ reward: "Q&A", note: "1 sub" },
	{ reward: "Phasmophobia", note: "5 subs" },
	{ reward: "Onesie reveal", note: "10 subs" },
	{ reward: "Cake on cam", note: "15 subs" },
	{ reward: "Confetti chaos", note: "25 subs" },
	{ reward: "Stretch goal", note: "dream" },
];

function newId(): string {
	return crypto.randomUUID();
}

/** Build the default tracker used to seed a fresh database. */
export function sampleData(): Data {
	return {
		goals: SAMPLE_GOALS.map((g) => ({
			id: newId(),
			reward: g.reward,
			note: g.note,
			unlocked: false,
		})),
		currentIndex: 0,
	};
}

/**
 * Keep the tracker's invariants consistent after any mutation:
 * `currentIndex` always points at the first locked goal (or past the end when
 * everything is unlocked). Goals unlock top-to-bottom.
 */
export function recompute(data: Data): Data {
	const firstLocked = data.goals.findIndex((g) => !g.unlocked);
	return {
		goals: data.goals,
		currentIndex: firstLocked === -1 ? data.goals.length : firstLocked,
	};
}

/** Remove every `note` so the tracker is safe to expose publicly. */
export function stripNotes(data: Data): PublicData {
	return {
		currentIndex: data.currentIndex,
		goals: data.goals.map(({ id, reward, unlocked }) => ({ id, reward, unlocked })),
	};
}

/** Normalize one optional note into a trimmed string or `undefined`. */
function cleanNote(note: unknown): string | undefined {
	if (typeof note !== "string") return undefined;
	const trimmed = note.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validate an import document and, on success, produce a fully normalized state.
 *
 * Accepts two shapes (both keyed on `goals`):
 *  - minimal:    `{ goals: [{ reward, note? }] }`
 *  - full export: the raw state object produced by Export (`{ goals: [...], currentIndex }`)
 *
 * Behaviour:
 *  - All errors are collected; the caller must never partial-write.
 *  - Client-supplied `id` / `unlocked` / `currentIndex` are ignored.
 *  - On success every goal is reset to `unlocked: false` and `currentIndex: 0`.
 */
export function validateImport(input: unknown): ImportResult {
	const errors: ImportError[] = [];

	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return { ok: false, errors: [{ index: -1, message: "Document must be a JSON object." }] };
	}

	const goals = (input as Record<string, unknown>).goals;
	if (!Array.isArray(goals)) {
		return { ok: false, errors: [{ index: -1, message: "`goals` must be an array." }] };
	}
	if (goals.length === 0) {
		return {
			ok: false,
			errors: [{ index: -1, message: "`goals` must contain at least one goal." }],
		};
	}
	if (goals.length > MAX_GOALS) {
		return {
			ok: false,
			errors: [{ index: -1, message: `Too many goals: ${goals.length} (max ${MAX_GOALS}).` }],
		};
	}

	const normalized: Goal[] = [];
	goals.forEach((raw, index) => {
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			errors.push({ index, message: "Goal must be an object." });
			return;
		}
		const reward = (raw as Record<string, unknown>).reward;
		if (typeof reward !== "string") {
			errors.push({ index, message: "`reward` is required and must be a string." });
			return;
		}
		const trimmed = reward.trim();
		if (trimmed.length === 0) {
			errors.push({ index, message: "`reward` must not be empty." });
			return;
		}
		if (trimmed.length > MAX_REWARD_LENGTH) {
			errors.push({
				index,
				message: `\`reward\` is too long (${trimmed.length} chars, max ${MAX_REWARD_LENGTH}).`,
			});
			return;
		}
		const note = (raw as Record<string, unknown>).note;
		if (note !== undefined && typeof note !== "string") {
			errors.push({ index, message: "`note` must be a string when present." });
			return;
		}
		normalized.push({ id: newId(), reward: trimmed, note: cleanNote(note), unlocked: false });
	});

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return {
		ok: true,
		data: { goals: normalized, currentIndex: 0 },
		rewards: normalized.map((g) => g.reward),
	};
}
