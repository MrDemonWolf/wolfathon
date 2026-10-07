import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

const drawId = "2c390a6a-6214-42f8-a806-9c6c6701b6f9";
const serverSeed = "9c".repeat(32);
const pool = ["sample_alpha", "sample_beta"];

function sha256(value: string) {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function makeProof() {
	const commitmentHash = sha256(
		JSON.stringify({
			algorithm: "sha256-commit-reveal-v1",
			spinId: drawId,
			serverSeed,
			pool: pool.map((login) => [login, 1]),
		}),
	);
	const drawHash = sha256(`${serverSeed}:${drawId}:0`);
	const bucket = Number.parseInt(drawHash.slice(0, 13), 16) % pool.length;
	const winnerLogin = pool[bucket];
	if (!winnerLogin) throw new Error("The test draw should select one of its sample entrants.");
	return {
		commitmentHash,
		winnerLogin,
		record: {
			drawId,
			kind: "draw" as const,
			winnerLogin,
			winnerName: winnerLogin === "sample_alpha" ? "Sample Alpha" : "Sample Beta",
			drawnAt: Date.now(),
			proof: {
				algorithm: "sha256-commit-reveal-v1" as const,
				commitmentHash,
				serverSeed,
				drawHash,
				drawCounter: 0,
				pool,
				targetIndex: bucket,
			},
		},
	};
}

test("raffle publishes its hash, reveals the result, and verifies the proof", async ({ page }) => {
	const proof = makeProof();
	const giveaway: Record<string, unknown> = {
		config: {
			command: "!enter",
			giftThreshold: 5,
			giftWinnerSlots: 2,
			raffleWinnerSlots: 2,
			open: true,
			tosUrl: "",
		},
		startedAt: Date.now(),
		gifters: [],
		entrants: [
			{ login: pool[0], name: "Sample Alpha", enteredAt: Date.now() - 10_000 },
			{ login: pool[1], name: "Sample Beta", enteredAt: Date.now() - 5_000 },
		],
		winners: [],
		pendingClaim: null,
		pendingRaffleDraw: null,
		raffleHistory: [],
	};
	let proofHistory: (typeof proof.record)[] = [];

	await page.route("**/api/trpc/**", async (route) => {
		const url = new URL(route.request().url());
		const procedure = url.pathname.split("/api/trpc/")[1];
		if (procedure === "giveaway.getRaw") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([{ result: { data: giveaway } }]),
			});
			return;
		}
		if (procedure === "giveaway.history") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([{ result: { data: proofHistory } }]),
			});
			return;
		}
		if (procedure === "giveaway.drawRaffle") {
			giveaway.pendingRaffleDraw = {
				drawId,
				kind: "draw",
				commitmentHash: proof.commitmentHash,
				createdAt: Date.now(),
				revealAt: Date.now() + 5_000,
				poolSize: pool.length,
				queuedCount: 0,
			};
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([
					{
						result: {
							data: {
								drawId,
								commitmentHash: proof.commitmentHash,
								revealAt: Date.now() + 5_000,
								poolSize: pool.length,
							},
						},
					},
				]),
			});
			return;
		}
		if (procedure === "giveaway.revealRaffleDraw") {
			giveaway.pendingRaffleDraw = null;
			proofHistory = [proof.record];
			giveaway.raffleHistory = [
				{
					drawId,
					kind: "draw",
					winnerLogin: proof.winnerLogin,
					winnerName: proof.record.winnerName,
					drawnAt: proof.record.drawnAt,
					commitmentHash: proof.commitmentHash,
					poolSize: pool.length,
					targetIndex: proof.record.proof.targetIndex,
				},
			];
			giveaway.winners = [
				{
					id: "sample-winner",
					login: proof.winnerLogin,
					name: proof.record.winnerName,
					source: "raffle",
					shipped: false,
					drawnAt: proof.record.drawnAt,
				},
			];
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([{ result: { data: proof.record } }]),
			});
			return;
		}
		await route.continue();
	});

	await page.goto("/dashboard/giveaways");
	await expect(page.getByRole("heading", { name: "Sticker giveaway" })).toBeVisible();
	await page.getByRole("button", { name: "Draw winner" }).click();
	await expect(page.getByText(proof.commitmentHash, { exact: true })).toBeVisible();
	await expect(page.getByText(serverSeed, { exact: true })).toHaveCount(0);
	const showProofs = page.getByRole("button", { name: "View recent raffle proofs (1)" });
	await expect(showProofs).toBeVisible({ timeout: 12_000 });
	await showProofs.click();
	await page.locator("summary").filter({ hasText: "SHA-256 proof" }).click();
	await page.getByRole("button", { name: "Verify proof" }).click();
	await expect(
		page.getByRole("status").getByText("Verified: hash and winner match."),
	).toBeVisible();
});
