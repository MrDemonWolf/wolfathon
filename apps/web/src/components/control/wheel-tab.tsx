"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { WheelSlot } from "@wolfathon/api/wheel";
import { MAX_LABEL_LEN, MAX_SLOTS, MAX_WEIGHT, slotColor } from "@wolfathon/api/wheel";
import { Button } from "@wolfathon/ui/components/button";
import { Checkbox } from "@wolfathon/ui/components/checkbox";
import { Input } from "@wolfathon/ui/components/input";
import { Label } from "@wolfathon/ui/components/label";
import { ChevronDown, ChevronUp, Dices, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { type DragEvent, useState } from "react";
import { toast } from "sonner";

import { controlTrpc, queryClient } from "@/utils/trpc";

import { WheelPreview } from "./wheel-preview";

export function WheelTab() {
	const rawOptions = controlTrpc.wheel.getRaw.queryOptions(undefined, {
		// Poll so a spin triggered elsewhere (or the live history) shows up here.
		refetchInterval: 3000,
	});
	const { data, isError, refetch } = useQuery(rawOptions);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: rawOptions.queryKey });
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
	const trigger = useMutation(
		controlTrpc.wheel.trigger.mutationOptions({
			onSuccess: (r) => {
				if (r.label) toast.success(`Landed on: ${r.label}`);
				invalidate();
			},
			onError,
		}),
	);

	// New-dare draft + the index currently being dragged for native reorder.
	const [draft, setDraft] = useState("");
	const [dragIndex, setDragIndex] = useState<number | null>(null);

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
	const atCap = slots.length >= MAX_SLOTS;

	// Move slot at `from` to position `to`, then persist the new order (every id,
	// exactly once). Shared by mouse drop and the keyboard Move up/down buttons.
	const moveTo = (from: number, to: number) => {
		if (to < 0 || to >= slots.length || from === to) return;
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
		if (!label || atCap) return;
		upsertSlot.mutate({ label }, { onSuccess: () => setDraft("") });
	};

	return (
		<div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-heading text-lg font-bold">Wheel of dares</h2>
					<p className="text-sm text-muted-foreground">
						Spin a weighted wheel of chat dares. Land random, or send the wheel to a specific slot —
						the overlay plays the spin.
					</p>
				</div>

				{/* Spin */}
				<div className="rounded-2xl panel-card p-5">
					<Button
						size="lg"
						onClick={() => trigger.mutate({})}
						disabled={trigger.isPending || enabledCount === 0}
					>
						{trigger.isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Dices className="size-4" />
						)}
						Spin (random)
					</Button>
					<p className="mt-2 text-xs text-muted-foreground">
						{enabledCount === 0
							? "Enable at least one dare to spin."
							: `${enabledCount} ${enabledCount === 1 ? "dare" : "dares"} in the pool.`}
					</p>
				</div>

				{/* Slots editor */}
				<div className="rounded-2xl panel-card p-5">
					<div className="flex items-center justify-between">
						<h3 className="font-heading font-bold">Dares</h3>
						<span className="text-xs text-muted-foreground">
							{slots.length} / {MAX_SLOTS}
						</span>
					</div>

					<div className="mt-3 flex items-center gap-2">
						<Label htmlFor="wheel-add" className="sr-only">
							Add a dare
						</Label>
						<Input
							id="wheel-add"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") addDare();
							}}
							maxLength={MAX_LABEL_LEN}
							placeholder="Add a dare"
						/>
						<Button
							variant="outline"
							onClick={addDare}
							disabled={upsertSlot.isPending || atCap || !draft.trim()}
						>
							<Plus className="size-4" /> Add
						</Button>
					</div>
					{atCap ? (
						<p className="mt-2 text-xs text-muted-foreground">
							Slot cap reached — remove a dare to add another.
						</p>
					) : null}

					{slots.length === 0 ? (
						<p className="mt-3 text-sm text-muted-foreground">No dares yet.</p>
					) : (
						<ul className="mt-3 flex flex-col gap-2">
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
									onSpin={() => trigger.mutate({ slotId: slot.id })}
									onDelete={() => removeSlot.mutate({ id: slot.id })}
								/>
							))}
						</ul>
					)}
				</div>

				{/* History */}
				<div className="rounded-2xl panel-card p-5">
					<h3 className="font-heading font-bold">Recent spins ({data.history.length})</h3>
					{data.history.length === 0 ? (
						<p className="mt-3 text-sm text-muted-foreground">No spins yet.</p>
					) : (
						<ul className="mt-3 flex flex-col gap-2">
							{data.history.map((spin) => (
								<li
									key={spin.id}
									className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
								>
									<span className="text-sm font-medium">{spin.label}</span>
									<span className="text-xs text-muted-foreground">
										{new Date(spin.at).toLocaleTimeString()}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			<div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
				<h2 className="font-heading text-lg font-bold">Live preview</h2>
				<WheelPreview doc={data} />
			</div>
		</div>
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
	onDelete: () => void;
}) {
	return (
		<li
			draggable
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			className={`flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 ${
				slot.enabled ? "" : "opacity-60"
			}`}
		>
			{/* Mouse drag handle (decorative for AT) + keyboard Move up/down — the
			    native HTML5 drag is mouse-only, so the buttons are the keyboard path. */}
			<span aria-hidden className="cursor-grab text-muted-foreground">
				<GripVertical className="size-4" />
			</span>
			<div className="flex flex-col">
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onMoveUp}
					disabled={isFirst}
					aria-label={`Move ${slot.label} up`}
				>
					<ChevronUp className="size-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onMoveDown}
					disabled={isLast}
					aria-label={`Move ${slot.label} down`}
				>
					<ChevronDown className="size-3.5" />
				</Button>
			</div>
			<Checkbox
				checked={slot.enabled}
				onCheckedChange={(checked) => onToggle(checked === true)}
				aria-label={`Enable ${slot.label}`}
			/>
			<Input
				className="h-8 min-w-0 flex-1"
				defaultValue={slot.label}
				maxLength={MAX_LABEL_LEN}
				aria-label={`Dare ${index + 1}`}
				onBlur={(e) => {
					if (e.target.value !== slot.label) onLabel(e.target.value);
				}}
			/>
			<Input
				type="number"
				min={1}
				max={MAX_WEIGHT}
				className="h-8 w-20"
				defaultValue={slot.weight}
				title="weight"
				aria-label={`Weight for ${slot.label}`}
				onBlur={(e) => {
					const weight = Number(e.target.value);
					if (Number.isFinite(weight) && weight !== slot.weight) onWeight(weight);
				}}
			/>
			<input
				type="color"
				value={slotColor(slot, index)}
				onChange={(e) => onColor(e.target.value)}
				aria-label={`Colour for ${slot.label}`}
				className="size-8 cursor-pointer rounded-[0.6rem] border border-input bg-transparent"
			/>
			{slot.color ? (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onColor("")}
					aria-label={`Reset colour for ${slot.label}`}
				>
					Reset
				</Button>
			) : null}
			<Button variant="secondary" size="sm" onClick={onSpin}>
				<Dices className="size-3.5" /> Spin to this
			</Button>
			<Button variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${slot.label}`}>
				<Trash2 className="size-4" />
			</Button>
		</li>
	);
}
