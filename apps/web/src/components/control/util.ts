import { pad2 } from "@wolfathon/api/timer";

/** `YYYYMMDD-HHMM` stamp for export filenames. */
export function nowStamp(): string {
	const d = new Date();
	return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

/**
 * Trigger a browser download of in-memory text. Shared by the goals/timer export
 * and the full backup, which had grown two byte-identical copies differing only in
 * whether the MIME type was hard-coded.
 */
export function downloadFile(filename: string, text: string, mime = "application/json"): void {
	const url = URL.createObjectURL(new Blob([text], { type: mime }));
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
