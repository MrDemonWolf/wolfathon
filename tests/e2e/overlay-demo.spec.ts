import { expect, test, type Page } from "@playwright/test";
import type { WheelControlDoc } from "@wolfathon/api/wheel";

type OverlaySoundSettings = {
	wheelTickEnabled: boolean;
	wheelPickEnabled: boolean;
	rewardUnlockEnabled: boolean;
	allRewardsEnabled: boolean;
	timerEndEnabled: boolean;
	timerWarningEnabled: boolean;
	wheelPickPreset: string;
	rewardPreset: string;
	allRewardsPreset: string;
	timerWarningPreset: string;
	timerPreset: string;
	customSound: {
		id: string;
		fileName: string;
		mimeType: string;
		sizeBytes: number;
	} | null;
};

type SoundAsset = { id: string; mimeType: string; base64: string };

async function queryTrpc<T>(page: Page, procedure: string, input?: unknown): Promise<T> {
	const url = new URL(`/api/trpc/${procedure}`, page.url());
	url.searchParams.set("batch", "1");
	url.searchParams.set("input", JSON.stringify(input === undefined ? {} : { 0: input }));
	const response = await page.request.get(url.toString());
	if (!response.ok()) throw new Error(`${procedure} returned HTTP ${response.status()}`);
	const payload = await response.json();
	const data = payload[0]?.result?.data;
	if (data === undefined) throw new Error(`${procedure} returned no data`);
	return data as T;
}

function shortWavTone(): Buffer {
	const sampleRate = 8000;
	const frameCount = sampleRate / 10;
	const dataBytes = frameCount * 2;
	const buffer = Buffer.alloc(44 + dataBytes);
	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + dataBytes, 4);
	buffer.write("WAVEfmt ", 8);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write("data", 36);
	buffer.writeUInt32LE(dataBytes, 40);
	for (let frame = 0; frame < frameCount; frame++) {
		const sample = Math.sin((2 * Math.PI * 660 * frame) / sampleRate) * 0.18;
		buffer.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2);
	}
	return buffer;
}

function watchPublicApi(page: Page) {
	const requests: string[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.includes("/api/public-trpc/")) {
			requests.push(request.url());
		}
	});
	return requests;
}

async function monitorWebAudio(page: Page) {
	await page.addInitScript(() => {
		const counts = { oscillators: 0, bufferSources: 0, mediaPlays: 0 };
		Object.defineProperty(window, "__wolfathonAudioStarts", {
			configurable: true,
			value: counts,
		});
		const originalPlay = HTMLMediaElement.prototype.play;
		HTMLMediaElement.prototype.play = function () {
			counts.mediaPlays += 1;
			return originalPlay.call(this);
		};
		const constructor = window.AudioContext;
		if (!constructor) return;
		for (const [method, key] of [
			["createOscillator", "oscillators"],
			["createBufferSource", "bufferSources"],
		] as const) {
			const originalCreate = constructor.prototype[method];
			constructor.prototype[method] = function (...args) {
				const source = originalCreate.apply(this, args);
				const originalStart = source.start.bind(source);
				source.start = (...startArgs) => {
					counts[key] += 1;
					originalStart(...startArgs);
				};
				return source;
			};
		}
	});
}

async function getAudioStarts(page: Page) {
	return page.evaluate(() => {
		return (
			(
				window as Window & {
					__wolfathonAudioStarts?: {
						oscillators: number;
						bufferSources: number;
						mediaPlays: number;
					};
				}
			).__wolfathonAudioStarts ?? { oscillators: 0, bufferSources: 0, mediaPlays: 0 }
		);
	});
}

test.describe("sample overlay previews", () => {
	test("gallery shows standard and compact overlays and can spin its sample wheel", async ({
		page,
	}, testInfo) => {
		await monitorWebAudio(page);
		const browserErrors: string[] = [];
		page.on("console", (message) => {
			if (message.type() === "error") browserErrors.push(message.text());
		});
		await page.goto("/overlay/demo");

		await expect(page.getByRole("heading", { name: "Wolfathon overlays" })).toBeVisible();
		for (const label of [
			"Timer • standard",
			"Timer • compact",
			"Rewards • standard",
			"Rewards • compact",
			"Wheel of dares • sample slots",
		]) {
			await expect(page.getByText(label, { exact: true })).toBeVisible();
		}
		await expect(page.getByRole("img", { name: "Running" })).toBeVisible();
		await expect(page.getByText("VIP for one month")).toHaveCount(2);
		const detentPins = page.getByTestId("wheel-detent-pin");
		await expect(detentPins).toHaveCount(36);
		const pinPositions = await detentPins.evaluateAll((pins) =>
			pins.map((pin) => {
				const circle = pin.querySelector("circle");
				return [Number(circle?.getAttribute("cx")), Number(circle?.getAttribute("cy"))] as const;
			}),
		);
		const minPinSpacing = Math.min(
			...pinPositions.map((position, index) => {
				const next = pinPositions[(index + 1) % pinPositions.length];
				if (!next) return 0;
				return Math.hypot(position[0] - next[0], position[1] - next[1]);
			}),
		);
		expect(minPinSpacing).toBeGreaterThan(7.5);
		await page.screenshot({
			path: testInfo.outputPath("overlay-gallery-preview.png"),
			fullPage: true,
			style: "nextjs-portal { display: none !important; }",
		});

		const timerStages = page.getByRole("group", { name: "Timer example stage" });
		await timerStages.getByRole("button", { name: "Paused" }).click();
		await expect(page.getByRole("img", { name: "Paused — stream offline" }).first()).toBeVisible();
		await timerStages.getByRole("button", { name: "Time added" }).click();
		await expect(page.getByText("+15m").first()).toBeVisible();
		const addedTimeBadges = page.getByTestId("time-added-badge");
		await expect(addedTimeBadges).toHaveCount(2);
		await expect
			.poll(() =>
				addedTimeBadges.evaluateAll((badges) =>
					badges.every((badge) => {
						const badgeBounds = badge.getBoundingClientRect();
						const timerBounds = badge.parentElement?.getBoundingClientRect();
						const countdownBounds = badge.parentElement
							?.querySelector<HTMLElement>('[data-testid="timer-countdown"]')
							?.getBoundingClientRect();
						return (
							timerBounds != null &&
							badgeBounds.left >= timerBounds.left &&
							badgeBounds.right <= timerBounds.right &&
							badgeBounds.top >= timerBounds.top &&
							badgeBounds.bottom <= timerBounds.bottom &&
							countdownBounds != null &&
							(badgeBounds.right <= countdownBounds.left ||
								countdownBounds.right <= badgeBounds.left ||
								badgeBounds.bottom <= countdownBounds.top ||
								countdownBounds.bottom <= badgeBounds.top)
						);
					}),
				),
			)
			.toBe(true);
		await page.waitForFunction(() => {
			return (
				((window as Window & { __wolfathonAudioStarts?: { oscillators: number } })
					.__wolfathonAudioStarts?.oscillators ?? 0) >= 2
			);
		});
		const beforeFinal30Seconds = await getAudioStarts(page);
		await timerStages.getByRole("button", { name: "Final 30 seconds" }).click();
		await expect
			.poll(async () => (await getAudioStarts(page)).oscillators)
			.toBeGreaterThan(beforeFinal30Seconds.oscillators);
		const previewTimerSound = page.getByRole("button", { name: "Preview timer ending" });
		const beforeTimerPreview = await getAudioStarts(page);
		await previewTimerSound.click();
		await expect
			.poll(async () => (await getAudioStarts(page)).oscillators)
			.toBeGreaterThan(beforeTimerPreview.oscillators);
		const beforeTimerEnd = await getAudioStarts(page);
		await timerStages.getByRole("button", { name: "Running" }).click();
		await expect(addedTimeBadges).toHaveCount(0);
		await timerStages.getByRole("button", { name: "Ended" }).click();
		await expect
			.poll(async () => (await getAudioStarts(page)).oscillators)
			.toBeGreaterThanOrEqual(beforeTimerEnd.oscillators + 1);

		const rewardStages = page.getByRole("group", { name: "Rewards example stage" });
		await rewardStages.getByRole("button", { name: "Almost there" }).click();
		await rewardStages.getByRole("button", { name: "Just unlocked" }).click();
		await expect(page.getByText("Unlocked", { exact: true }).first()).toBeVisible();
		const beforeAllRewards = await getAudioStarts(page);
		await rewardStages.getByRole("button", { name: "All unlocked" }).click();
		await expect
			.poll(async () => (await getAudioStarts(page)).oscillators)
			.toBeGreaterThan(beforeAllRewards.oscillators + 8);
		await rewardStages.getByRole("button", { name: "Progress" }).click();
		await rewardStages.getByRole("button", { name: "Almost there" }).click();
		const beforeRepeatUnlock = await getAudioStarts(page);
		await rewardStages.getByRole("button", { name: "Just unlocked" }).click();
		await expect
			.poll(async () => (await getAudioStarts(page)).oscillators)
			.toBeGreaterThan(beforeRepeatUnlock.oscillators);

		const beforeSpin = await getAudioStarts(page);
		await page.getByRole("button", { name: "Spin sample wheel" }).click();
		await expect(page.getByRole("button", { name: "Wheel spinning…" })).toBeDisabled();
		await expect(page.getByTestId("wheel-clacker")).toHaveClass(/wheel-pointer-tapping/);
		await expect
			.poll(async () => (await getAudioStarts(page)).bufferSources)
			.toBeGreaterThan(beforeSpin.bufferSources);
		expect((await getAudioStarts(page)).oscillators).toBe(beforeSpin.oscillators);
		await expect(page.getByText("The pack lands on")).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText(/SHA-256|hash proof/i)).toHaveCount(0);
		await expect
			.poll(async () => (await getAudioStarts(page)).bufferSources)
			.toBeGreaterThan(beforeSpin.bufferSources);
		await expect
			.poll(async () => (await getAudioStarts(page)).oscillators)
			.toBeGreaterThan(beforeSpin.oscillators);
		expect(browserErrors).toEqual([]);
	});

	test("overlay sound toggles and a small custom sound can be uploaded", async ({ page }) => {
		test.setTimeout(60_000);
		await monitorWebAudio(page);
		await page.goto("/dashboard/settings/overlays");
		const originalSettings = await queryTrpc<{ overlaySounds: OverlaySoundSettings }>(
			page,
			"settings.get",
		);
		const originalSounds = originalSettings.overlaySounds;
		const originalAsset = originalSounds.customSound
			? await queryTrpc<SoundAsset | null>(page, "settings.getSoundAsset", {
					id: originalSounds.customSound.id,
				})
			: null;
		if (originalSounds.customSound && !originalAsset) {
			throw new Error("The existing custom overlay sound could not be backed up for this test.");
		}
		const soundSettings = page.getByRole("region", { name: "Overlay sound settings" });
		const wheelToggle = soundSettings.getByRole("checkbox", { name: "Wheel ticks" });
		const wheelPickToggle = soundSettings.getByRole("checkbox", { name: "Dare picked" });
		const rewardToggle = soundSettings.getByRole("checkbox", { name: "Reward unlock" });
		const allRewardsToggle = soundSettings.getByRole("checkbox", {
			name: "All rewards unlocked",
		});
		const timerWarningToggle = soundSettings.getByRole("checkbox", {
			name: "Final 30 seconds",
		});
		const timerToggle = soundSettings.getByRole("checkbox", { name: "Timer ending" });
		const removeButton = soundSettings.getByRole("button", { name: "Remove" });
		const wheelPickPreset = soundSettings.getByRole("combobox", {
			name: "Dare picked sound effect",
		});
		const rewardPreset = soundSettings.getByRole("combobox", { name: "Reward sound effect" });
		const allRewardsPreset = soundSettings.getByRole("combobox", {
			name: "All rewards unlocked sound effect",
		});
		const timerWarningPreset = soundSettings.getByRole("combobox", {
			name: "Final 30 seconds sound effect",
		});
		const timerPreset = soundSettings.getByRole("combobox", {
			name: "Timer sound effect",
			exact: true,
		});
		let uploadAttempted = false;

		try {
			await expect(wheelToggle).toBeVisible();
			await expect(wheelToggle).toBeEnabled();
			const wheelPickSelection =
				originalSounds.wheelPickPreset === "hype-reveal" ? "sparkle" : "hype-reveal";
			let beforeSelection = await getAudioStarts(page);
			await wheelPickPreset.selectOption(wheelPickSelection);
			await expect
				.poll(async () => (await getAudioStarts(page)).oscillators)
				.toBeGreaterThan(beforeSelection.oscillators);
			if (wheelPickSelection !== "hype-reveal") {
				beforeSelection = await getAudioStarts(page);
				await wheelPickPreset.selectOption("hype-reveal");
				await expect
					.poll(async () => (await getAudioStarts(page)).oscillators)
					.toBeGreaterThan(beforeSelection.oscillators);
			}
			await expect(wheelPickPreset).toHaveValue("hype-reveal");
			const rewardSelection = originalSounds.rewardPreset === "warm-bell" ? "sparkle" : "warm-bell";
			beforeSelection = await getAudioStarts(page);
			await rewardPreset.selectOption(rewardSelection);
			await expect
				.poll(async () => (await getAudioStarts(page)).oscillators)
				.toBeGreaterThan(beforeSelection.oscillators);
			await expect(rewardPreset).toBeEnabled();
			await expect(rewardPreset).toHaveValue(rewardSelection);
			await expect(allRewardsPreset).toHaveValue(originalSounds.allRewardsPreset);
			const allRewardsSelection =
				originalSounds.allRewardsPreset === "party-pop" ? "hype-reveal" : "party-pop";
			beforeSelection = await getAudioStarts(page);
			await allRewardsPreset.selectOption(allRewardsSelection);
			await expect
				.poll(async () => (await getAudioStarts(page)).oscillators)
				.toBeGreaterThan(beforeSelection.oscillators);
			await expect(allRewardsPreset).toHaveValue(allRewardsSelection);
			const alarmSelection =
				originalSounds.timerWarningPreset === "classic-alarm" ? "gentle-alarm" : "classic-alarm";
			beforeSelection = await getAudioStarts(page);
			await timerWarningPreset.selectOption(alarmSelection);
			await expect
				.poll(async () => (await getAudioStarts(page)).oscillators)
				.toBeGreaterThan(beforeSelection.oscillators);
			await expect(timerWarningPreset).toHaveValue(alarmSelection);
			const endSelection =
				originalSounds.timerPreset === "game-over" ? "classic-alarm" : "game-over";
			beforeSelection = await getAudioStarts(page);
			await timerPreset.selectOption(endSelection);
			await expect
				.poll(async () => (await getAudioStarts(page)).oscillators)
				.toBeGreaterThan(beforeSelection.oscillators);
			await expect(timerPreset).toHaveValue(endSelection);
			const previews = soundSettings.getByRole("button", { name: "Preview", exact: true });
			for (let index = 0; index < 6; index++) {
				const beforePreview = await getAudioStarts(page);
				await previews.nth(index).click();
				if (index === 0) {
					await expect
						.poll(async () => (await getAudioStarts(page)).bufferSources)
						.toBeGreaterThan(beforePreview.bufferSources);
				} else {
					await expect
						.poll(async () => (await getAudioStarts(page)).oscillators)
						.toBeGreaterThan(beforePreview.oscillators);
				}
			}
			for (const toggle of [
				wheelToggle,
				wheelPickToggle,
				rewardToggle,
				allRewardsToggle,
				timerWarningToggle,
				timerToggle,
			]) {
				await expect(toggle).toBeEnabled();
				await toggle.evaluate((element) => element.scrollIntoView({ block: "center" }));
				if (!(await toggle.isChecked())) {
					await toggle.click();
					await expect(toggle).toHaveAttribute("aria-checked", "true");
				}
			}
			uploadAttempted = true;
			await page.locator("#overlay-sound-file").setInputFiles({
				name: "demo-chime.wav",
				mimeType: "audio/wav",
				buffer: shortWavTone(),
			});
			await expect(soundSettings.getByText("demo-chime.wav", { exact: false })).toBeVisible();
			const previewCustom = soundSettings.getByRole("button", { name: "Preview custom" });
			await expect(previewCustom).toBeEnabled();
			await previewCustom.click();
			await previewCustom.click();
			await expect
				.poll(async () => (await getAudioStarts(page)).mediaPlays)
				.toBeGreaterThanOrEqual(2);
		} finally {
			if (uploadAttempted && (await removeButton.isVisible().catch(() => false))) {
				await removeButton.click();
				await expect(removeButton).toBeHidden();
			}
			if (originalAsset && originalSounds.customSound) {
				await page.locator("#overlay-sound-file").setInputFiles({
					name: originalSounds.customSound.fileName,
					mimeType: originalAsset.mimeType,
					buffer: Buffer.from(originalAsset.base64, "base64"),
				});
				await expect(
					soundSettings.getByText(originalSounds.customSound.fileName, { exact: false }),
				).toBeVisible();
			}
			for (const [control, original] of [
				[wheelPickPreset, originalSounds.wheelPickPreset],
				[rewardPreset, originalSounds.rewardPreset],
				[allRewardsPreset, originalSounds.allRewardsPreset],
				[timerWarningPreset, originalSounds.timerWarningPreset],
				[timerPreset, originalSounds.timerPreset],
			] as const) {
				if ((await control.inputValue()) !== original) {
					await control.selectOption(original);
					await expect(control).toBeEnabled();
				}
			}
			for (const [toggle, original] of [
				[wheelToggle, originalSounds.wheelTickEnabled],
				[wheelPickToggle, originalSounds.wheelPickEnabled],
				[rewardToggle, originalSounds.rewardUnlockEnabled],
				[allRewardsToggle, originalSounds.allRewardsEnabled],
				[timerWarningToggle, originalSounds.timerWarningEnabled],
				[timerToggle, originalSounds.timerEndEnabled],
			] as const) {
				if ((await toggle.isChecked().catch(() => false)) !== original) {
					await toggle.evaluate((element) => element.scrollIntoView({ block: "center" }));
					await toggle.click();
					await expect(toggle).toHaveAttribute("aria-checked", String(original));
				}
			}
		}
	});

	test("timer demo is token-free and can use compact presentation", async ({ page }) => {
		const requests = watchPublicApi(page);
		await page.goto("/overlay/timer?demo=1&minimal=1&t=not-a-real-token");

		await expect(page.getByTestId("overlay-demo-timer")).toBeVisible();
		await expect(page.getByRole("img", { name: "Running" })).toHaveCount(0);
		await expect(page.getByText("WOLFATHON", { exact: true })).toHaveCount(0);
		expect(requests).toEqual([]);
	});

	test("rewards demo is token-free and accepts the compact flag", async ({ page }) => {
		const requests = watchPublicApi(page);
		await page.goto("/overlay/rewards?demo=1&minimal=1");

		await expect(page.getByTestId("overlay-demo-rewards")).toBeVisible();
		await expect(page.getByText("VIP for one month")).toBeVisible();
		await expect(page.getByText("Next Reward", { exact: true })).toHaveCount(0);
		expect(requests).toEqual([]);
	});

	test("wheel demo renders sample slots without contacting the public API", async ({ page }) => {
		const requests = watchPublicApi(page);
		await page.goto("/overlay/wheel?demo=1");

		await expect(page.getByTestId("overlay-demo-wheel").locator("svg")).toBeVisible();
		await expect(page.getByText("Howl on mic")).toBeVisible();
		expect(requests).toEqual([]);
	});

	test("admin random spins animate in the preview and remain visible after landing", async ({
		page,
	}) => {
		test.setTimeout(60_000);
		await page.goto("/dashboard/wheel");
		await expect(page.getByRole("heading", { name: "Wheel of dares" })).toBeVisible();
		await expect(page.getByText("Wheel source")).toBeVisible();
		const preview = page.getByTestId("wheel-live-preview");
		const wheel = preview.getByTestId("wheel-view");
		const savedWheel = await queryTrpc<WheelControlDoc>(page, "wheel.getRaw");
		await expect(preview.getByTestId("wheel-detent-pin")).toHaveCount(36);
		await expect(wheel).toHaveAttribute("data-phase", "idle");
		await expect(wheel).toHaveAttribute("data-visible", "true");
		await expect(page.getByRole("textbox", { name: "Dare 5" })).toHaveAttribute(
			"title",
			"Talk in an accent (3 min)",
		);
		const firstDare = page
			.getByRole("listitem")
			.filter({ has: page.getByRole("textbox", { name: "Dare 1", exact: true }) });
		await firstDare.getByRole("button", { name: "Edit settings for Howl on mic" }).click();
		const colourInput = firstDare.locator('input[type="color"]');
		const originalColour = await colourInput.inputValue();
		await firstDare.getByText("25 colours").click();
		const shortcuts = firstDare.getByRole("group", { name: "Colour shortcuts for Howl on mic" });
		await expect(shortcuts.getByRole("button")).toHaveCount(25);
		await shortcuts.locator('button[data-color="#ef476f"]').click();
		await expect(colourInput).toHaveValue("#ef476f");
		await shortcuts.locator(`button[data-color="${originalColour}"]`).click();
		await expect(colourInput).toHaveValue(originalColour);

		let previewWheel = { ...savedWheel };
		const spinId = "00000000-0000-4000-8000-000000000001";
		const commitmentHash = "a".repeat(64);
		await page.route("**/api/trpc/**", async (route) => {
			const procedures =
				new URL(route.request().url()).pathname.split("/api/trpc/")[1]?.split(",") ?? [];
			if (procedures.includes("wheel.prepareRandom")) {
				const createdAt = Date.now();
				const pendingCommitment = { spinId, commitmentHash, createdAt, revealAt: createdAt + 250 };
				previewWheel = { ...previewWheel, pendingCommitment, pendingSpin: null };
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify([{ result: { data: pendingCommitment } }]),
				});
				return;
			}
			if (procedures.includes("wheel.revealRandom")) {
				const label = previewWheel.slots.find((slot) => slot.enabled)?.label ?? "Howl on mic";
				previewWheel = {
					...previewWheel,
					pendingCommitment: null,
					pendingSpin: { spinId, targetIndex: 0, at: Date.now(), commitmentHash },
				};
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify([{ result: { data: { spinId, targetIndex: 0, label } } }]),
				});
				return;
			}
			if (procedures.includes("wheel.getRaw") || procedures.includes("state.getRaw")) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(
						procedures.map((procedure) => ({
							result: { data: procedure === "wheel.getRaw" ? previewWheel : {} },
						})),
					),
				});
				return;
			}
			await route.continue();
		});
		await page.getByRole("button", { name: "Spin randomly" }).click();
		await expect(wheel).toHaveAttribute("data-phase", "spinning", { timeout: 25_000 });
		await expect(wheel).toHaveAttribute("data-phase", "result", { timeout: 10_000 });
		await expect(wheel).toHaveAttribute("data-phase", "idle", { timeout: 10_000 });
		await expect(wheel).toHaveAttribute("data-visible", "true");
		await expect(preview.getByTestId("wheel-detent-pin")).toHaveCount(36);

		await page.setViewportSize({ width: 390, height: 844 });
		const widths = await page.evaluate(() => ({
			viewport: document.documentElement.clientWidth,
			content: document.documentElement.scrollWidth,
		}));
		expect(widths.content).toBeLessThanOrEqual(widths.viewport);
	});

	test("sample gallery fits a narrow browser without horizontal overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/overlay/demo");

		await expect(page.getByRole("heading", { name: "Wolfathon overlays" })).toBeVisible();
		await expect(page.getByText("Wheel of dares • sample slots", { exact: true })).toBeVisible();
		const widths = await page.evaluate(() => ({
			viewport: document.documentElement.clientWidth,
			content: document.documentElement.scrollWidth,
		}));
		expect(widths.content).toBeLessThanOrEqual(widths.viewport);
	});
});
