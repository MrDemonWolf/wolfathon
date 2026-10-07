import type { OverlaySoundEvent, OverlaySoundConfig } from "@wolfathon/api/settings";

type OverlaySoundPreviewEvent = OverlaySoundEvent | "timer-preview";

export type PlayableOverlaySound = Pick<
	OverlaySoundConfig,
	| "wheelTickEnabled"
	| "wheelPickEnabled"
	| "rewardUnlockEnabled"
	| "allRewardsEnabled"
	| "timerEndEnabled"
	| "timerWarningEnabled"
	| "wheelPickPreset"
	| "rewardPreset"
	| "allRewardsPreset"
	| "timerWarningPreset"
	| "timerPreset"
> & {
	customSound: { mimeType: string; base64: string } | null;
};

/** Play an uploaded cue when present, otherwise generate the selected app-made preset. */
export function playOverlaySound(
	sound: PlayableOverlaySound | null | undefined,
	event: OverlaySoundPreviewEvent,
) {
	if (!sound || typeof window === "undefined") return;
	const enabled =
		event === "wheel-pick"
			? sound.wheelPickEnabled
			: event === "reward"
				? sound.rewardUnlockEnabled
				: event === "all-rewards"
					? sound.allRewardsEnabled
					: event === "timer-warning"
						? sound.timerWarningEnabled
						: event === "timer"
							? sound.timerEndEnabled
							: true;
	if (!enabled) return;
	if (sound.customSound) {
		const audio = new Audio(
			`data:${sound.customSound.mimeType};base64,${sound.customSound.base64}`,
		);
		audio.volume = 0.68;
		void audio.play().catch(() => undefined);
		return;
	}
	void playBuiltIn(event, sound);
}

/** Sample-only time-added cue used by the timer stage in the demo gallery. */
export function playTimerPreviewCue() {
	void playBuiltIn("timer-preview", {
		wheelPickPreset: "bright-chime",
		rewardPreset: "bright-chime",
		allRewardsPreset: "party-pop",
		timerWarningPreset: "gentle-alarm",
		timerPreset: "game-over",
	});
}

/** Preview the configured timer-end alarm from the sample gallery. */
export function playTimerEndPreviewCue(sound: PlayableOverlaySound) {
	playOverlaySound(sound, "timer");
}

/** Add soft, progressively slower clicks that follow the wheel's settling spin. */
export function playWheelTickSequence(
	sound: PlayableOverlaySound | null | undefined,
	durationSeconds: number,
	tickCount: number,
) {
	if (!sound?.wheelTickEnabled || typeof window === "undefined" || tickCount < 1) return;
	void playWheelTicks(durationSeconds, tickCount);
}

async function playWheelTicks(durationSeconds: number, tickCount: number) {
	const AudioContextConstructor = window.AudioContext;
	if (!AudioContextConstructor) return;
	let context: AudioContext;
	try {
		context = new AudioContextConstructor();
		await context.resume();
	} catch {
		return;
	}
	if (context.state !== "running") {
		void context.close();
		return;
	}

	const sampleCount = Math.ceil(context.sampleRate * 0.02);
	const clickBuffer = context.createBuffer(1, sampleCount, context.sampleRate);
	const samples = clickBuffer.getChannelData(0);
	for (let index = 0; index < sampleCount; index++) {
		samples[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
	}

	const startAt = context.currentTime + 0.03;
	for (let index = 0; index < tickCount; index++) {
		const progress = (index + 1) / tickCount;
		const when = startAt + durationSeconds * progress ** 1.7;
		const source = context.createBufferSource();
		const filter = context.createBiquadFilter();
		const gain = context.createGain();
		source.buffer = clickBuffer;
		filter.type = "highpass";
		filter.frequency.setValueAtTime(1500, when);
		gain.gain.setValueAtTime(0.0001, when);
		gain.gain.exponentialRampToValueAtTime(0.055, when + 0.001);
		gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.018);
		source.connect(filter);
		filter.connect(gain);
		gain.connect(context.destination);
		source.start(when);
		source.stop(when + 0.02);
	}
	setTimeout(() => void context.close(), durationSeconds * 1000 + 500);
}

async function playBuiltIn(
	event: OverlaySoundPreviewEvent,
	presets: Pick<
		PlayableOverlaySound,
		"wheelPickPreset" | "rewardPreset" | "allRewardsPreset" | "timerWarningPreset" | "timerPreset"
	>,
) {
	const AudioContextConstructor = window.AudioContext;
	if (!AudioContextConstructor) return;
	let context: AudioContext;
	try {
		context = new AudioContextConstructor();
		await context.resume();
	} catch {
		return; // Browser autoplay/audio policy can mute a source; never disturb the overlay.
	}
	if (context.state !== "running") {
		void context.close();
		return;
	}

	const now = context.currentTime + 0.02;
	const note = (
		frequency: number,
		start: number,
		duration: number,
		volume: number,
		wave: OscillatorType = "triangle",
	) => {
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = wave;
		oscillator.frequency.setValueAtTime(frequency, start);
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		oscillator.connect(gain);
		gain.connect(context.destination);
		oscillator.start(start);
		oscillator.stop(start + duration + 0.02);
	};
	const sweep = (
		from: number,
		to: number,
		start: number,
		duration: number,
		volume: number,
		wave: OscillatorType,
	) => {
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = wave;
		oscillator.frequency.setValueAtTime(from, start);
		oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(volume, start + 0.04);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		oscillator.connect(gain);
		gain.connect(context.destination);
		oscillator.start(start);
		oscillator.stop(start + duration + 0.02);
	};
	const cinematicBlast = (start: number) => {
		const duration = 2.2;
		const frameCount = Math.ceil(context.sampleRate * duration);
		const buffer = context.createBuffer(1, frameCount, context.sampleRate);
		const samples = buffer.getChannelData(0);
		for (let index = 0; index < frameCount; index++) {
			const fade = 1 - index / frameCount;
			samples[index] = (Math.random() * 2 - 1) * fade;
		}
		const source = context.createBufferSource();
		const filter = context.createBiquadFilter();
		const noiseGain = context.createGain();
		source.buffer = buffer;
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(1500, start);
		filter.frequency.exponentialRampToValueAtTime(58, start + duration);
		noiseGain.gain.setValueAtTime(0.0001, start);
		noiseGain.gain.exponentialRampToValueAtTime(0.2, start + 0.04);
		noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		source.connect(filter);
		filter.connect(noiseGain);
		noiseGain.connect(context.destination);
		source.start(start);
		source.stop(start + duration);
		sweep(250, 52, start, 0.9, 0.055, "sawtooth");

		const sub = context.createOscillator();
		const subGain = context.createGain();
		sub.type = "sine";
		sub.frequency.setValueAtTime(82, start);
		sub.frequency.exponentialRampToValueAtTime(26, start + duration);
		subGain.gain.setValueAtTime(0.0001, start);
		subGain.gain.exponentialRampToValueAtTime(0.25, start + 0.035);
		subGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		sub.connect(subGain);
		subGain.connect(context.destination);
		sub.start(start);
		sub.stop(start + duration + 0.02);
	};
	const gameOver = (start: number) => {
		[659.25, 587.33, 523.25, 440, 392, 329.63].forEach((frequency, index) =>
			note(frequency, start + index * 0.14, 0.2, 0.075, "square"),
		);
		note(220, start + 0.84, 0.62, 0.1, "triangle");
		note(110, start + 0.84, 0.62, 0.045, "sine");
	};

	if (event === "timer-preview") {
		[659.25, 880].forEach((frequency, index) =>
			note(frequency, now + index * 0.16, 0.3, 0.1, "sine"),
		);
	} else if (event === "timer-warning") {
		const warningNotes =
			presets.timerWarningPreset === "classic-alarm" ? [660, 880, 660, 880] : [784, 988];
		const spacing = presets.timerWarningPreset === "classic-alarm" ? 0.24 : 0.42;
		warningNotes.forEach((frequency, index) =>
			note(frequency, now + index * spacing, 0.2, 0.09, "sine"),
		);
	} else if (event === "timer") {
		if (presets.timerPreset === "cinematic-blast") {
			cinematicBlast(now);
		} else if (presets.timerPreset === "game-over") {
			gameOver(now);
		} else {
			const alarmNotes =
				presets.timerPreset === "classic-alarm"
					? [880, 660, 880, 660, 880, 660]
					: [784, 988, 784, 988];
			const spacing = presets.timerPreset === "classic-alarm" ? 0.3 : 0.52;
			alarmNotes.forEach((frequency, index) =>
				note(frequency, now + index * spacing, 0.34, 0.095, "sine"),
			);
		}
	} else {
		const preset =
			event === "wheel-pick"
				? presets.wheelPickPreset
				: event === "all-rewards"
					? presets.allRewardsPreset
					: presets.rewardPreset;
		switch (preset) {
			case "sparkle":
				[784, 988, 1175, 1568].forEach((frequency, index) =>
					note(frequency, now + index * 0.085, 0.38, 0.075, "sine"),
				);
				break;
			case "victory-fanfare":
				[392, 523, 659, 784].forEach((frequency, index) =>
					note(frequency, now + index * 0.13, 0.32, 0.09),
				);
				break;
			case "warm-bell":
				[392, 523, 659].forEach((frequency, index) =>
					note(frequency, now + index * 0.16, 0.72, 0.1, "sine"),
				);
				break;
			case "party-pop":
				[392, 523, 659].forEach((frequency) => note(frequency, now, 0.64, 0.045, "square"));
				[523, 659, 784, 1047, 784, 1047, 1319].forEach((frequency, index) =>
					note(frequency, now + index * 0.095, 0.36, 0.085, "sine"),
				);
				sweep(180, 740, now, 0.42, 0.035, "sawtooth");
				note(1568, now + 0.68, 0.7, 0.11, "sine");
				break;
			case "hype-reveal":
				[196, 247, 294].forEach((frequency) => note(frequency, now, 0.52, 0.055, "square"));
				[392, 494, 587, 784, 988, 1175].forEach((frequency, index) =>
					note(frequency, now + index * 0.075, 0.24, 0.085, "sawtooth"),
				);
				sweep(130, 660, now, 0.48, 0.055, "sawtooth");
				note(1568, now + 0.52, 0.72, 0.12, "sine");
				break;
			default:
				[523.25, 659.25, 783.99].forEach((frequency, index) =>
					note(frequency, now + index * 0.11, 0.62, 0.12),
				);
		}
	}
	setTimeout(
		() => void context.close(),
		event === "timer" && presets.timerPreset === "cinematic-blast"
			? 2_600
			: event === "timer" && presets.timerPreset === "game-over"
				? 2_000
				: 1_500,
	);
}
