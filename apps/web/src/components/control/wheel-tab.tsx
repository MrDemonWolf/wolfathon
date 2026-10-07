"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { WheelSlot, WheelSpin } from "@wolfathon/api/wheel";
import {
	MAX_LABEL_LEN,
	MAX_SLOTS,
	MAX_WEIGHT,
	slotColor,
	verifyWheelSpinProof,
	WHEEL_SPIN_LOCK_MS,
} from "@wolfathon/api/wheel";
import {
	AlertDialog,
	AlertDialogClose,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@wolfathon/ui/components/alert-dialog";
import { Button } from "@wolfathon/ui/components/button";
import { Checkbox } from "@wolfathon/ui/components/checkbox";
import { Input } from "@wolfathon/ui/components/input";
import { Label } from "@wolfathon/ui/components/label";
import {
	ChevronDown,
	ChevronUp,
	Dices,
	GripVertical,
	Loader2,
	Plus,
	Settings2,
	Trash2,
} from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { LIVE_POLL_MS } from "@/utils/constants";
import { controlTrpc } from "@/utils/trpc";

import { useControlDoc } from "./use-control-doc";
import { WheelPreview } from "./wheel-preview";

const WHEEL_COLOR_SHORTCUTS = [
	{ name: "Azure", hex: "#2f6df0" },
	{ name: "Teal", hex: "#21c0a8" },
	{ name: "Indigo", hex: "#6e6cf6" },
	{ name: "Sky", hex: "#36c6f4" },
	{ name: "Amethyst", hex: "#9b6cf6" },
	{ name: "Mint", hex: "#46d39a" },
	{ name: "Cornflower", hex: "#5b8def" },
	{ name: "Ember", hex: "#f0a24b" },
	{ name: "Periwinkle", hex: "#7d8bd6" },
	{ name: "Ocean", hex: "#2aa9e0" },
	{ name: "Crimson", hex: "#ef476f" },
	{ name: "Tangerine", hex: "#f97316" },
	{ name: "Gold", hex: "#eab308" },
	{ name: "Lime", hex: "#84cc16" },
	{ name: "Emerald", hex: "#10b981" },
	{ name: "Aqua", hex: "#06b6d4" },
	{ name: "Cobalt", hex: "#2563eb" },
	{ name: "Violet", hex: "#8b5cf6" },
	{ name: "Rose", hex: "#f43f5e" },
	{ name: "Coral", hex: "#fb7185" },
	{ name: "Peach", hex: "#fdba74" },
	{ name: "Lemon", hex: "#fde047" },
	{ name: "Spring", hex: "#a3e635" },
	{ name: "Seafoam", hex: "#5eead4" },
	{ name: "Lilac", hex: "#c4b5fd" },
] as const;

export function WheelTab() {
	const { data, isError, refetch, invalidate } = useControlDoc(
		controlTrpc.wheel.getRaw.queryOptions(undefined, {
			// Poll so a spin triggered elsewhere (or the live history) shows up here.
			refetchInterval: LIVE_POLL_MS,
		}),
	);
	// Overlay theme is global (Settings → Theme) — pull it in so the preview
	// matches what OBS renders.
	const { data: stateDoc } = useQuery(controlTrpc.state.getRaw.queryOptions());
	// Every mutation surfaces failures — the panel polls every 3s, so a silently
	// rejected save/spin would otherwise just look like nothing happened.
	const onError = (e: { message: string }) => toast.error(e.message);

	const upsertSlot = useMutation(
		controlTrpc.wheel.upsertSlot.mutationOptions({ onSuccess: invalidate, onError }),
	);
	const removeSlot = useMutation(
		controlTrpc.wheel.removeSlot.mutationOptions({ onSuccess: invalidate, onError }),
	);
	const reorderSlots = useMutation(
		controlTrpc.wheel.reorderSlots.mutationOptions({ onSuccess: invalidate, onError }),
	);
	const [spinLocked, setSpinLocked] = useState(false);
	const serverSpinLocked =
		!!data?.pendingCommitment ||
		(data?.pendingSpin !== null && data?.pendingSpin !== undefined
			? Date.now() - data.pendingSpin.at < WHEEL_SPIN_LOCK_MS
			: false);
	const spinUnavailable = spinLocked || serverSpinLocked;
	const spinUnlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const revealRequested = useRef<string | null>(null);
	const [revealFailed, setRevealFailed] = useState(false);
	useEffect(
		() => () => {
			if (spinUnlockTimer.current) clearTimeout(spinUnlockTimer.current);
		},
		[],
	);
	const finishSpin = (r: { label: string | null }) => {
		if (r.label) toast.success(`Landed on: ${r.label}`);
		setSpinLocked(true);
		if (spinUnlockTimer.current) clearTimeout(spinUnlockTimer.current);
		// Match the shared server lock so another spin cannot replace this reveal.
		spinUnlockTimer.current = setTimeout(() => {
			spinUnlockTimer.current = null;
			setSpinLocked(false);
		}, WHEEL_SPIN_LOCK_MS);
		invalidate();
	};
	const trigger = useMutation(
		controlTrpc.wheel.trigger.mutationOptions({ onSuccess: finishSpin, onError }),
	);
	const prepareRandom = useMutation(
		controlTrpc.wheel.prepareRandom.mutationOptions({
			onSuccess: () => {
				revealRequested.current = null;
				setRevealFailed(false);
				invalidate();
			},
			onError,
		}),
	);
	const { mutate: revealRandomSpin, isPending: revealPending } = useMutation(
		controlTrpc.wheel.revealRandom.mutationOptions({
			onSuccess: finishSpin,
			onError: (error) => {
				setRevealFailed(true);
				onError(error);
			},
		}),
	);
	const pendingCommitment = data?.pendingCommitment;
	useEffect(() => {
		const commitment = pendingCommitment;
		if (!commitment) {
			revealRequested.current = null;
			setRevealFailed(false);
			return;
		}
		if (revealFailed || revealPending || revealRequested.current === commitment.spinId) return;
		const timeout = setTimeout(
			() => {
				revealRequested.current = commitment.spinId;
				revealRandomSpin({ spinId: commitment.spinId });
			},
			Math.max(0, commitment.revealAt - Date.now()),
		);
		return () => clearTimeout(timeout);
	}, [pendingCommitment, revealFailed, revealPending, revealRandomSpin]);
	const clearHistory = useMutation(
		controlTrpc.wheel.clearHistory.mutationOptions({
			onSuccess: () => {
				toast.success("Spin history cleared");
				invalidate();
			},
			onError,
		}),
	);
	const triggerSpin = (input: { slotId?: string } = {}) => {
		if (input.slotId) trigger.mutate({ slotId: input.slotId });
	};
	const retryReveal = () => {
		const spinId = data?.pendingCommitment?.spinId;
		if (!spinId) return;
		revealRequested.current = spinId;
		setRevealFailed(false);
		revealRandomSpin({ spinId });
	};

	// New-dare draft + the index currently being dragged for native reorder.
	const [draft, setDraft] = useState("");
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	// Recent spins start collapsed to the last 5; "Load more" reveals another 5.
	const [shown, setShown] = useState(5);

	if (!data && isError) {
		return (
			<div role="status" className="rounded-2xl panel-card p-5">
				<h2 className="font-heading text-lg font-bold">Couldn&apos;t load the wheel</h2>
				<p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
				<Button variant="outline" className="mt-3" onClick={() => refetch()}>
					Retry
				</Button>
			</div>
		);
	}
	if (!data) {
		return (
			<p role="status" className="text-sm text-muted-foreground">
				Loading wheel…
			</p>
		);
	}

	const slots = data.slots;
	const enabledCount = slots.filter((s) => s.enabled).length;
	const enabledWeight = slots.reduce((total, slot) => total + (slot.enabled ? slot.weight : 0), 0);
	const atCap = slots.length >= MAX_SLOTS;
	const poolLocked = data.pendingCommitment !== null;

	// Move slot at `from` to position `to`, then persist the new order (every id,
	// exactly once). Shared by mouse drop and the keyboard Move up/down buttons.
	const moveTo = (from: number, to: number) => {
		if (poolLocked || to < 0 || to >= slots.length || from === to) return;
		const ids = slots.map((s) => s.id);
		const [moved] = ids.splice(from, 1);
		if (moved === undefined) return;
		ids.splice(to, 0, moved);
		reorderSlots.mutate({ ids });
	};
	const dropAt = (to: number) => {
		if (dragIndex === null) return;
		moveTo(dragIndex, to);
	};

	const addDare = () => {
		const label = draft.trim();
		if (!label || atCap || poolLocked) return;
		upsertSlot.mutate({ label }, { onSuccess: () => setDraft("") });
	};

	return (
		<div className="flex flex-col gap-5">
			<header className="flex flex-col gap-1">
				<p className="eyebrow text-[0.65rem]">STREAM TOOL</p>
				<h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
					Wheel of dares
				</h2>
				<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
					Build your dare pool, set the odds, and send a spin straight to the stream.
				</p>
			</header>

			{/* Primary stream action stays above the long editor on small screens. */}
			<section
				aria-label="Spin the wheel"
				className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 shadow-sm sm:p-5"
			>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<p className="font-semibold">Ready when you are</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{enabledCount === 0
								? "Enable a dare to start the wheel."
								: `${enabledCount} active ${enabledCount === 1 ? "dare" : "dares"} · adjust the odds below.`}
						</p>
					</div>
					<Button
						size="lg"
						className="min-h-11 w-full rounded-xl sm:w-auto sm:min-w-48"
						onClick={() => prepareRandom.mutate()}
						disabled={
							prepareRandom.isPending || revealPending || spinUnavailable || enabledCount === 0
						}
					>
						{prepareRandom.isPending || revealPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Dices className="size-4" />
						)}
						{prepareRandom.isPending ? "Publishing hash…" : "Spin randomly"}
					</Button>
				</div>
				{data.pendingCommitment && (
					<div role="status" className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
						<p className="text-sm font-medium">
							Random result committed. The spin will reveal automatically.
						</p>
						<code className="mt-1 block break-all text-xs text-muted-foreground">
							SHA-256 · {data.pendingCommitment.commitmentHash}
						</code>
						{revealFailed && (
							<Button size="sm" variant="outline" className="mt-2 min-h-11" onClick={retryReveal}>
								Retry spin reveal
							</Button>
						)}
					</div>
				)}
				{spinUnavailable && !data.pendingCommitment && (
					<p role="status" className="mt-3 text-sm text-muted-foreground">
						The wheel is spinning. Wait for it to land before starting another spin.
					</p>
				)}
			</section>

			<div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(21rem,0.95fr)]">
				<aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h2 className="font-heading text-lg font-bold">Live preview</h2>
							<p className="text-xs text-muted-foreground">The same wheel your viewers see</p>
						</div>
						<span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 text-xs font-medium text-primary">
							<span aria-hidden className="size-1.5 rounded-full bg-primary" />
							Stream view
						</span>
					</div>
					<div className="mx-auto w-full max-w-[20rem] sm:max-w-[24rem] lg:max-w-none">
						<WheelPreview doc={data} theme={stateDoc?.theme} />
					</div>
				</aside>

				<div className="flex min-w-0 flex-col gap-5">
					{/* Slots editor */}
					<section
						aria-labelledby="wheel-dares-heading"
						className="rounded-2xl panel-card p-4 sm:p-5"
					>
						<div className="flex items-center justify-between gap-3">
							<div>
								<h3 id="wheel-dares-heading" className="font-heading font-bold">
									Dare pool
								</h3>
								<p className="mt-1 text-xs text-muted-foreground">
									{enabledCount} active · {slots.length} total
								</p>
							</div>
							<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
								{slots.length} / {MAX_SLOTS}
							</span>
						</div>

						<form
							className="mt-4 flex items-center gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								addDare();
							}}
						>
							<Label htmlFor="wheel-add" className="sr-only">
								Add a dare
							</Label>
							<Input
								id="wheel-add"
								value={draft}
								disabled={poolLocked}
								onChange={(e) => setDraft(e.target.value)}
								maxLength={MAX_LABEL_LEN}
								placeholder="Add a dare"
								className="h-11 min-w-0"
							/>
							<Button
								type="submit"
								variant="outline"
								className="min-h-11 shrink-0 rounded-xl"
								disabled={upsertSlot.isPending || atCap || !draft.trim() || poolLocked}
							>
								<Plus className="size-4" /> Add
							</Button>
						</form>
						{atCap ? (
							<p className="mt-2 text-xs text-muted-foreground">
								Slot cap reached — remove a dare to add another.
							</p>
						) : null}

						{slots.length === 0 ? (
							<div className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center">
								<p className="font-medium">Your wheel is ready for its first dare.</p>
								<p className="mt-1 text-sm text-muted-foreground">
									Add one above to get the spin started.
								</p>
							</div>
						) : (
							<ul className="mt-4 flex flex-col gap-2">
								{slots.map((slot, index) => (
									<SlotRow
										key={slot.id}
										slot={slot}
										index={index}
										isFirst={index === 0}
										isLast={index === slots.length - 1}
										onMoveUp={() => moveTo(index, index - 1)}
										onMoveDown={() => moveTo(index, index + 1)}
										onDragStart={() => setDragIndex(index)}
										onDragOver={(e) => e.preventDefault()}
										onDrop={() => dropAt(index)}
										onToggle={(checked) => upsertSlot.mutate({ id: slot.id, enabled: checked })}
										onLabel={(label) => upsertSlot.mutate({ id: slot.id, label })}
										onWeight={(weight) => upsertSlot.mutate({ id: slot.id, weight })}
										onColor={(color) => upsertSlot.mutate({ id: slot.id, color })}
										onSpin={() => triggerSpin({ slotId: slot.id })}
										chance={slot.enabled && enabledWeight > 0 ? slot.weight / enabledWeight : null}
										spinDisabled={trigger.isPending || spinUnavailable}
										editingDisabled={poolLocked}
										onDelete={() => removeSlot.mutate({ id: slot.id })}
									/>
								))}
							</ul>
						)}
					</section>

					{/* History */}
					<section
						aria-labelledby="wheel-history-heading"
						className="rounded-2xl panel-card p-4 sm:p-5"
					>
						<div className="flex items-center justify-between gap-3">
							<div>
								<h3 id="wheel-history-heading" className="font-heading font-bold">
									Recent spins
								</h3>
								<p className="mt-1 text-xs text-muted-foreground">
									{data.history.length} {data.history.length === 1 ? "result" : "results"}
								</p>
							</div>
							{data.history.length > 0 && (
								<AlertDialog>
									<AlertDialogTrigger
										render={
											<Button
												variant="ghost"
												size="sm"
												className="min-h-11 rounded-xl text-muted-foreground hover:text-destructive"
												disabled={clearHistory.isPending}
											>
												<Trash2 className="size-4" />
												Clear all
											</Button>
										}
									/>
									<AlertDialogContent>
										<AlertDialogTitle>Clear spin history?</AlertDialogTitle>
										<AlertDialogDescription>
											Removes all {data.history.length} logged spins for a clean slate. Your dares
											(wheel slots) are kept. This can&apos;t be undone.
										</AlertDialogDescription>
										<AlertDialogFooter>
											<AlertDialogClose
												render={
													<Button variant="outline" className="min-h-11 rounded-xl">
														Cancel
													</Button>
												}
											/>
											<AlertDialogClose
												onClick={() => clearHistory.mutate()}
												render={
													<Button variant="destructive" className="min-h-11 rounded-xl">
														Clear all
													</Button>
												}
											/>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							)}
						</div>
						{data.history.length === 0 ? (
							<p className="mt-4 text-sm text-muted-foreground">
								Your spin results will appear here.
							</p>
						) : (
							<>
								<ul className="mt-4 flex flex-col gap-2">
									{data.history.slice(0, shown).map((spin) => (
										<li
											key={spin.id}
											className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
										>
											<span className="min-w-0 flex-1 text-sm font-medium">{spin.label}</span>
											<div className="max-w-full text-right">
												<div className="text-xs tabular-nums text-muted-foreground">
													{new Date(spin.at).toLocaleTimeString()}
												</div>
												{spin.proof && <SpinProofDetails spin={spin} />}
											</div>
										</li>
									))}
								</ul>
								{shown < data.history.length && (
									<Button
										variant="outline"
										size="sm"
										className="mt-3 min-h-11 w-full rounded-xl"
										onClick={() => setShown((n) => n + 5)}
									>
										<ChevronDown className="size-4" />
										Load more ({data.history.length - shown} older)
									</Button>
								)}
							</>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}

function SpinProofDetails({ spin }: { spin: WheelSpin }) {
	const [verification, setVerification] = useState<"idle" | "valid" | "invalid">("idle");
	const proof = spin.proof;
	if (!proof) return null;
	const verify = async () => {
		try {
			setVerification((await verifyWheelSpinProof(spin)) ? "valid" : "invalid");
		} catch {
			setVerification("invalid");
		}
	};
	return (
		<details className="mt-1 max-w-full text-left text-xs">
			<summary className="cursor-pointer text-primary">SHA-256 proof</summary>
			<div className="mt-2 w-[min(26rem,80vw)] space-y-1 rounded-lg bg-muted/50 p-2 text-left">
				<p>
					Commit: <code className="break-all">{proof.commitmentHash}</code>
				</p>
				<p>
					Seed: <code className="break-all">{proof.serverSeed}</code>
				</p>
				<p>
					Draw: <code className="break-all">{proof.drawHash}</code>
				</p>
				<p>Pool: {proof.pool.map((slot) => `${slot.label} (${slot.weight})`).join(" · ")}</p>
				<Button size="sm" variant="outline" className="mt-1" onClick={() => void verify()}>
					Verify result
				</Button>
				{verification !== "idle" && (
					<p
						role="status"
						className={verification === "valid" ? "text-emerald-500" : "text-destructive"}
					>
						{verification === "valid" ? "Proof matches this winner." : "Proof does not match."}
					</p>
				)}
			</div>
		</details>
	);
}

/** One editable dare row — native HTML5 drag handle, enable, label, weight, colour. */
function SlotRow({
	slot,
	index,
	isFirst,
	isLast,
	onMoveUp,
	onMoveDown,
	onDragStart,
	onDragOver,
	onDrop,
	onToggle,
	onLabel,
	onWeight,
	onColor,
	onSpin,
	chance,
	spinDisabled,
	editingDisabled,
	onDelete,
}: {
	slot: WheelSlot;
	index: number;
	isFirst: boolean;
	isLast: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onDragStart: () => void;
	onDragOver: (e: DragEvent) => void;
	onDrop: () => void;
	onToggle: (checked: boolean) => void;
	onLabel: (label: string) => void;
	onWeight: (weight: number) => void;
	onColor: (color: string) => void;
	onSpin: () => void;
	chance: number | null;
	spinDisabled: boolean;
	editingDisabled: boolean;
	onDelete: () => void;
}) {
	const currentColor = slotColor(slot, index);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const weightId = `wheel-weight-${slot.id}`;
	const colorId = `wheel-color-${slot.id}`;
	const settingsId = `wheel-settings-${slot.id}`;
	const chanceLabel =
		chance == null
			? `${slot.label} is disabled`
			: `Chance for ${slot.label}: ${Number((chance * 100).toFixed(3))}%`;
	return (
		<li
			draggable={!editingDisabled}
			onDragStart={onDragStart}
			onDragOver={editingDisabled ? undefined : onDragOver}
			onDrop={onDrop}
			data-testid="wheel-slot-row"
			style={{ borderInlineStartColor: currentColor, borderInlineStartWidth: 4 }}
			className={`overflow-hidden rounded-xl border border-border bg-card/70 transition-colors hover:border-primary/25 ${
				slot.enabled ? "" : "opacity-60"
			}`}
		>
			<div className="flex min-w-0 items-center gap-1.5 p-2 sm:gap-2 sm:p-2.5">
				{/* Drag works with a mouse; the settings panel provides large keyboard/touch reorder buttons. */}
				<span
					aria-hidden
					title="Drag to reorder"
					className="hidden cursor-grab text-muted-foreground sm:inline-flex"
				>
					<GripVertical className="size-4" />
				</span>
				<Label
					htmlFor={`wheel-enabled-${slot.id}`}
					className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl hover:bg-accent"
				>
					<Checkbox
						id={`wheel-enabled-${slot.id}`}
						checked={slot.enabled}
						onCheckedChange={(checked) => onToggle(checked === true)}
						disabled={editingDisabled}
						aria-label={`Enable ${slot.label}`}
					/>
				</Label>
				<span
					aria-hidden
					className="size-3 shrink-0 rounded-full ring-2 ring-background"
					style={{ backgroundColor: currentColor }}
				/>
				<Input
					className="h-11 min-w-0 flex-1 border-transparent bg-transparent px-1 font-medium shadow-none focus-visible:border-input"
					defaultValue={slot.label}
					disabled={editingDisabled}
					maxLength={MAX_LABEL_LEN}
					title={slot.label}
					aria-label={`Dare ${index + 1}`}
					onBlur={(e) => {
						if (e.target.value !== slot.label) onLabel(e.target.value);
					}}
				/>
				<output
					className="shrink-0 rounded-lg bg-muted/70 px-2 py-1.5 text-[0.68rem] font-semibold tabular-nums text-muted-foreground sm:text-xs"
					title="Chance based on the weights of enabled dares"
					aria-label={chanceLabel}
				>
					{chance == null ? "Off" : `${Number((chance * 100).toFixed(3))}%`}
				</output>
				<Button
					variant="ghost"
					size="icon"
					className="size-11 shrink-0 rounded-xl"
					onClick={() => setSettingsOpen((open) => !open)}
					aria-label={`${settingsOpen ? "Hide" : "Edit"} settings for ${slot.label}`}
					aria-expanded={settingsOpen}
					aria-controls={settingsId}
				>
					{settingsOpen ? <ChevronUp className="size-4" /> : <Settings2 className="size-4" />}
				</Button>
			</div>

			<div
				id={settingsId}
				hidden={!settingsOpen}
				className="border-t border-border bg-muted/15 px-3 py-3 sm:px-4"
			>
				<div className="grid gap-4 sm:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1.3fr)]">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={weightId}>Weight</Label>
						<Input
							id={weightId}
							type="number"
							min={1}
							max={MAX_WEIGHT}
							className="h-11 w-full"
							defaultValue={slot.weight}
							disabled={editingDisabled}
							aria-label={`Weight for ${slot.label}`}
							onBlur={(e) => {
								const weight = Number(e.target.value);
								if (Number.isFinite(weight) && weight !== slot.weight) onWeight(weight);
							}}
						/>
						<p className="text-xs text-muted-foreground">Higher weight means a larger slice.</p>
					</div>

					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<Label htmlFor={colorId}>Slice colour</Label>
							{/* Commit on blur to avoid a D1 write for every color-picker pointer move. */}
							<input
								id={colorId}
								type="color"
								defaultValue={currentColor}
								key={currentColor}
								onBlur={(e) => {
									if (e.target.value !== currentColor) onColor(e.target.value);
								}}
								aria-label={`Colour for ${slot.label}`}
								disabled={editingDisabled}
								className="size-11 cursor-pointer rounded-xl border border-input bg-transparent p-1"
							/>
							<details
								className="relative"
								onToggle={(event) => setPaletteOpen(event.currentTarget.open)}
							>
								<summary
									title="Choose a predefined colour"
									className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden"
								>
									25 colours
									<ChevronDown
										className={`size-4 transition-transform ${paletteOpen ? "rotate-180" : ""}`}
									/>
								</summary>
								<div
									role="group"
									aria-label={`Colour shortcuts for ${slot.label}`}
									className="mt-2 grid max-w-full grid-cols-5 gap-1.5 rounded-xl border border-border bg-popover p-2 shadow-xl sm:w-fit sm:gap-2 sm:p-2.5"
								>
									{WHEEL_COLOR_SHORTCUTS.map(({ name, hex }) => {
										const selected = currentColor === hex;
										return (
											<button
												key={hex}
												type="button"
												data-color={hex}
												title={`${name} · ${hex}`}
												aria-label={`${name} ${hex}`}
												aria-pressed={selected}
												disabled={editingDisabled}
												onClick={() => onColor(hex)}
												style={{ backgroundColor: hex }}
												className={`size-11 rounded-lg border transition hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${selected ? "border-foreground ring-2 ring-primary ring-offset-1 ring-offset-popover" : "border-white/40"}`}
											>
												<span className="sr-only">{name}</span>
											</button>
										);
									})}
								</div>
							</details>
							{slot.color ? (
								<Button
									variant="ghost"
									size="sm"
									className="min-h-11 rounded-xl"
									disabled={editingDisabled}
									onClick={() => onColor("")}
									aria-label={`Reset colour for ${slot.label}`}
								>
									Reset
								</Button>
							) : null}
						</div>
					</div>
				</div>

				<div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
					<p className="text-xs text-muted-foreground">Drag to reorder or use the arrow buttons.</p>
					<div className="flex items-center gap-1.5">
						<Button
							variant="secondary"
							size="sm"
							className="min-h-11 rounded-xl"
							onClick={onSpin}
							disabled={!slot.enabled || spinDisabled}
							title={
								!slot.enabled
									? "Enable this dare to spin to it"
									: spinDisabled
										? "Wait for the current spin to finish"
										: `Spin to ${slot.label}`
							}
							aria-label={`Spin to ${slot.label}${!slot.enabled ? "; enable this dare first" : spinDisabled ? "; wait for the current spin to finish" : ""}`}
						>
							<Dices className="size-4" /> Spin to this
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="size-11 rounded-xl"
							onClick={onMoveUp}
							disabled={editingDisabled || isFirst}
							aria-label={`Move ${slot.label} up`}
						>
							<ChevronUp className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="size-11 rounded-xl"
							onClick={onMoveDown}
							disabled={editingDisabled || isLast}
							aria-label={`Move ${slot.label} down`}
						>
							<ChevronDown className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="min-h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
							onClick={onDelete}
							disabled={editingDisabled}
							aria-label={`Delete ${slot.label}`}
						>
							<Trash2 className="size-4" /> Delete
						</Button>
					</div>
				</div>
			</div>
		</li>
	);
}
