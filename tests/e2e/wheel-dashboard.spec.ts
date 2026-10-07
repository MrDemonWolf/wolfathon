import { expect, test } from "@playwright/test";

const wheelDoc = {
	slots: [
		{ id: "dare-1", label: "Howl on mic", weight: 1, color: "#2f6df0", enabled: true },
		{ id: "dare-2", label: "10 push-ups", weight: 2, color: "#21c0a8", enabled: true },
		{ id: "dare-3", label: "Dance break", weight: 1, color: "#6e6cf6", enabled: false },
	],
	history: [],
	pendingSpin: null,
	pendingCommitment: null,
};

test("wheel controls stay compact and tappable on a phone-sized screen", async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await page.route("**/api/trpc/**", async (route) => {
		const procedures =
			new URL(route.request().url()).pathname.split("/api/trpc/")[1]?.split(",") ?? [];
		if (procedures.includes("wheel.getRaw") || procedures.includes("state.getRaw")) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(
					procedures.map((procedure) => ({
						result: { data: procedure === "wheel.getRaw" ? wheelDoc : {} },
					})),
				),
			});
			return;
		}
		await route.continue();
	});

	await page.goto("/dashboard/wheel");
	await expect(page.getByRole("heading", { name: "Wheel of dares" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Spin randomly" })).toBeVisible();
	await expect(page.getByTestId("wheel-live-preview")).toBeVisible();

	const settingsButton = page.getByRole("button", { name: "Edit settings for Howl on mic" });
	const settingsBounds = await settingsButton.boundingBox();
	expect(settingsBounds?.width).toBeGreaterThanOrEqual(44);
	expect(settingsBounds?.height).toBeGreaterThanOrEqual(44);
	await settingsButton.click();
	await expect(page.getByLabel("Weight for Howl on mic")).toBeVisible();
	await expect(page.getByRole("button", { name: "Spin to Howl on mic" })).toBeVisible();
	await page.locator("#wheel-settings-dare-1").getByText("25 colours", { exact: true }).click();
	const colours = page.getByRole("group", { name: "Colour shortcuts for Howl on mic" });
	await expect(colours).toBeVisible();
	await expect(colours.getByRole("button")).toHaveCount(25);
	const colourBounds = await colours.getByRole("button").first().boundingBox();
	expect(colourBounds?.width).toBeGreaterThanOrEqual(44);
	expect(colourBounds?.height).toBeGreaterThanOrEqual(44);
	await page.getByRole("button", { name: "Edit settings for Dance break" }).click();
	await expect(
		page.getByRole("button", { name: "Spin to Dance break; enable this dare first" }),
	).toBeDisabled();
	const dareName = await page.getByRole("textbox", { name: "Dare 1", exact: true }).boundingBox();
	expect(dareName?.width).toBeGreaterThanOrEqual(96);

	const hasHorizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
	);
	expect(hasHorizontalOverflow).toBe(false);
});
