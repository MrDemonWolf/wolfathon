import { pad2 } from "@wolfathon/api/timer";

/** `YYYYMMDD-HHMM` stamp for export filenames. */
export function nowStamp(): string {
	const d = new Date();
	return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}
