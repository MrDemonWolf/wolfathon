/**
 * Shared site footer — used on the public landing page AND under the operator
 * dashboard so the disclaimer + brand links appear globally. The `/overlay`
 * routes stay bare (no footer) for OBS, so this is opted into per layout rather
 * than living in the root layout.
 *
 * ponytail: external URLs centralised here — edit LINKS to repoint marketing /
 * website / repo without touching markup.
 */
const LINKS = {
	website: "https://mrdemonwolf.com",
	github: "https://github.com/MrDemonWolf/wolfathon",
	marketing: "https://mrdemonwolf.com/wolfathon",
} as const;

/** Wolfathon is an independent tool — keep the affiliation disclaimer honest.
 *  Exported so the landing page can show the same wording above the footer. */
export const DISCLAIMER =
	"Wolfathon is an independent, fan-made tool for MrDemonWolf's stream. Not affiliated with, endorsed by, or sponsored by Twitch, Amazon, or Ko-fi.";

export function SiteFooter() {
	const sha = process.env.NEXT_PUBLIC_COMMIT_SHA;

	return (
		<footer className="border-t border-primary/10 px-4 py-8">
			<div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 text-center">
				<nav
					aria-label="Wolfathon links"
					className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium"
				>
					<FooterLink href={LINKS.website}>Website</FooterLink>
					<FooterLink href={LINKS.github}>GitHub</FooterLink>
					<FooterLink href={LINKS.marketing}>Marketing</FooterLink>
				</nav>

				<p className="max-w-2xl text-xs leading-relaxed text-muted-foreground/80">{DISCLAIMER}</p>

				<div className="flex items-center gap-3 text-sm text-muted-foreground">
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
						<>
							<span aria-hidden className="text-muted-foreground/50">
								·
							</span>
							<a
								href={`${LINKS.github}/commit/${sha}`}
								target="_blank"
								rel="noopener noreferrer"
								title={`Deployed commit ${sha} — view on GitHub`}
								className="font-mono text-xs underline-offset-4 transition-colors hover:text-primary hover:underline"
							>
								{sha.slice(0, 7)}
							</a>
						</>
					)}
				</div>
			</div>
		</footer>
	);
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="text-muted-foreground transition-colors hover:text-primary"
		>
			{children}
		</a>
	);
}
