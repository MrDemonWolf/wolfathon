"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Input } from "./input";

/**
 * A minus / centered `tabular-nums` field / plus stepper. Owns the clamp + step
 * math so every numeric nudge control (current-subs, goal target) shares one
 * layout instead of hand-rolling the triplet. Value may be `undefined` (field
 * cleared → shows `placeholder`); `onChange` emits `undefined` for an empty field
 * so the caller can distinguish "0" from "unset". `emptyValue` is the base a +/-
 * step counts from when the value is currently unset (defaults to `min`).
 */
export function NumberStepper({
	value,
	onChange,
	min = 0,
	max,
	step = 1,
	emptyValue,
	size = "lg",
	label,
	placeholder,
	className,
}: {
	value: number | undefined;
	onChange: (value: number | undefined) => void;
	min?: number;
	max?: number;
	step?: number;
	emptyValue?: number;
	size?: "sm" | "lg";
	/** aria-label for the number field (the +/- buttons derive theirs from it). */
	label: string;
	placeholder?: string;
	className?: string;
}) {
	const s = SIZES[size];
	const clamp = (v: number) => {
		const floored = Math.max(min, Math.floor(v));
		return max != null ? Math.min(max, floored) : floored;
	};
	const bump = (delta: number) => onChange(clamp((value ?? emptyValue ?? min) + delta));

	return (
		<div className={cn("flex items-center", s.gap, className)}>
			<Button
				variant="outline"
				size={s.btnSize}
				className={s.btn}
				aria-label={`Decrease ${label}`}
				onClick={() => bump(-step)}
			>
				<Minus className={s.icon} />
			</Button>
			<Input
				className={cn("text-center tabular-nums", s.input)}
				type="number"
				min={min}
				max={max}
				aria-label={label}
				placeholder={placeholder}
				value={value ?? ""}
				onChange={(e) => {
					const raw = e.target.value;
					onChange(raw === "" ? undefined : clamp(Number(raw) || 0));
				}}
			/>
			<Button
				variant="outline"
				size={s.btnSize}
				className={s.btn}
				aria-label={`Increase ${label}`}
				onClick={() => bump(step)}
			>
				<Plus className={s.icon} />
			</Button>
		</div>
	);
}

const SIZES = {
	sm: {
		gap: "gap-1.5",
		btnSize: "icon-sm" as const,
		btn: "rounded-lg",
		icon: "size-4",
		input: "h-9 w-20 rounded-lg text-sm font-semibold",
	},
	lg: {
		gap: "gap-2",
		btnSize: "icon" as const,
		btn: "size-11 rounded-xl",
		icon: "size-5",
		input: "h-11 w-24 rounded-xl font-heading text-2xl font-extrabold",
	},
};
