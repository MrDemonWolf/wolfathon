/**
 * Build a ready-to-paste prompt for claude.ai so the operator can ask Claude to
 * produce a new config JSON, then paste it back into the import box.
 */
export function buildClaudePrompt(opts: {
	kind: string;
	schemaBullets: string[];
	exampleJson: string;
	currentJson: string;
}): string {
	return `You are editing my Wolfathon ${opts.kind}. Output ONLY valid JSON that matches the schema below — no prose, no markdown, no code fences.

Schema:
${opts.schemaBullets.map((b) => `- ${b}`).join("\n")}

Example of a valid document:
${opts.exampleJson}

My current config:
${opts.currentJson}

The change I want: <describe your change here, then send>`;
}
