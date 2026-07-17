import { ArrowUpRight } from "lucide-react";

import { WolfMark } from "@/components/wolf-mark";

/**
 * Shared site footer — used on the public landing page AND under the operator
 * dashboard so the disclaimer + brand links appear globally. The `/overlay`
 * routes stay bare (no footer) for OBS, so this is opted into per layout rather
 * than living in the root layout.
 *
 * ponytail: external URLs centralised here — edit LINKS to repoint without
 * touching markup.
 */
const LINKS = {
	website: "https://mrdemonwolf.com",
	github: "https://github.com/MrDemonWolf/wolfathon",
	discord: "https://mrdwolf.net/discord",
} as const;

/** Wolfathon is an independent tool — keep the affiliation disclaimer honest.
 *  Exported so the landing page can show the same wording near its CTA. */
export const DISCLAIMER =
	"Wolfathon is an independent, fan-made tool for MrDemonWolf's stream. Not affiliated with, endorsed by, or sponsored by Twitch, Amazon, or Ko-fi.";

export function SiteFooter() {
	const sha = process.env.NEXT_PUBLIC_COMMIT_SHA;

	return (
		<footer className="border-t border-border/60 bg-card/30">
			<div className="mx-auto w-full max-w-6xl px-4 py-14">
				<div className="flex flex-col gap-10 md:flex-row md:justify-between">
					{/* Brand block */}
					<div className="max-w-sm">
						<div className="flex items-center gap-2.5">
							<WolfMark className="size-8" />
							<span className="font-heading text-lg font-bold tracking-tight">Wolfathon</span>
						</div>
						<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
							A branded Twitch subathon toolkit — timer, rewards, dares, giveaways, and OBS overlays
							for MrDemonWolf&apos;s stream.
						</p>
					</div>

					{/* Link groups */}
					<div className="grid grid-cols-2 gap-10 sm:grid-cols-2">
						<FooterGroup label="Get started">
							<FooterLink href="/dashboard">Control panel</FooterLink>
						</FooterGroup>
						<FooterGroup label="Project">
							<FooterLink href={LINKS.github} external>
								GitHub
							</FooterLink>
							<FooterLink href={LINKS.discord} external>
								Discord
							</FooterLink>
							<FooterLink href={LINKS.website} external>
								Website
							</FooterLink>
						</FooterGroup>
					</div>
				</div>

				<p className="mt-10 max-w-2xl text-xs leading-relaxed text-muted-foreground/80">
					{DISCLAIMER}
				</p>

				<div className="mt-8 flex flex-col gap-3 border-t border-border/60 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
					<p>
						© {new Date().getFullYear()} Wolfathon by{" "}
						<a
							href={LINKS.website}
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground transition-colors hover:text-primary"
						>
							MrDemonWolf, Inc.
						</a>
					</p>
					{sha && (
						<a
							href={`${LINKS.github}/commit/${sha}`}
							target="_blank"
							rel="noopener noreferrer"
							title={`Deployed commit ${sha} — view on GitHub`}
							className="font-mono text-xs underline-offset-4 transition-colors hover:text-primary hover:underline"
						>
							{sha.slice(0, 7)}
						</a>
					)}
				</div>
			</div>
		</footer>
	);
}

function FooterGroup({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<p className="eyebrow text-[0.7rem]">{label}</p>
			<ul className="mt-4 space-y-2.5">{children}</ul>
		</div>
	);
}

function FooterLink({
	href,
	external,
	children,
}: {
	href: string;
	external?: boolean;
	children: React.ReactNode;
}) {
	const className =
		"inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm";

	if (!external) {
		// Internal route (Cloudflare Access gates it) — plain anchor is fine here.
		return (
			<li>
				<a href={href} className={className}>
					{children}
				</a>
			</li>
		);
	}

	return (
		<li>
			<a href={href} target="_blank" rel="noopener noreferrer" className={className}>
				{children}
				<ArrowUpRight aria-hidden className="size-3 opacity-60" />
				<span className="sr-only">(opens in a new tab)</span>
			</a>
		</li>
	);
}
