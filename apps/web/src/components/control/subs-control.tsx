"use client";

import { Button } from "@wolfathon/ui/components/button";
import { NumberStepper } from "@wolfathon/ui/components/number-stepper";

/** Current sub count — fed live by Twitch sub/gift events; adjust by hand here. */
export function SubsControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
	const set = (v: number) => onChange(Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
	return (
		<div className="rounded-2xl panel-card p-5">
			<h2 className="font-heading text-lg font-bold">Current subs</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Drives the next-goal progress bar. Twitch sub &amp; gift events bump this automatically —
				nudge it here if you need to.
			</p>
			<div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
				<NumberStepper
					size="lg"
					value={value}
					onChange={(v) => set(v ?? 0)}
					min={0}
					label="Current sub count"
				/>
				<div className="flex items-center gap-1.5">
					<span className="mr-0.5 text-xs text-muted-foreground">Quick add</span>
					{[5, 10, 25].map((n) => (
						<Button
							key={n}
							variant="secondary"
							size="sm"
							className="rounded-lg tabular-nums"
							onClick={() => set(value + n)}
						>
							+{n}
						</Button>
					))}
				</div>
			</div>
		</div>
	);
}
