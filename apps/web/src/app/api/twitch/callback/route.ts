import { createDb } from "@wolfathon/db";
import { exchangeCode, finalizeConnection, timingSafeEqual } from "@wolfathon/api/twitch";
import { readTwitch, writeTwitch } from "@wolfathon/api/store";
import { type WebBindings } from "@wolfathon/env/web";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

/**
 * Twitch OAuth redirect callback (Authorization Code flow).
 *
 * The broadcaster is sent here by Twitch after consent. This path is PUBLIC (it
 * must NOT sit behind Cloudflare Access — gate the operator panel (app root)
 * and `/api/trpc`, but exclude this callback path). CSRF is enforced via the
 * `state` token that
 * `twitch.startAuth` stored on the D1 row; the client_secret stays server-side.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const url = new URL(req.url);
	const back = (status: string) =>
		NextResponse.redirect(new URL(`/twitch?twitch=${status}`, url.origin));

	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	// Twitch sends ?error=access_denied when the broadcaster cancels consent.
	if (url.searchParams.get("error") || !code || !state) return back("error");

	const env = getCloudflareContext().env as unknown as WebBindings;
	if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET || !env.NEXT_PUBLIC_SERVER_URL) {
		return back("error");
	}

	const db = createDb(env.DB);
	const doc = await readTwitch(db);
	// CSRF: the state must match the one minted by startAuth.
	if (!doc.oauthState || !timingSafeEqual(doc.oauthState, state)) return back("state_error");

	// Consume the state up front so it is strictly single-use: a duplicate or
	// replayed callback now fails the check above instead of clobbering a
	// successful connect. ponytail: blind overwrite (no compare-and-set) — a
	// dead-heat of two callbacks both reading pre-consume is a narrow,
	// single-operator-only window; add a version column if that ever matters.
	const prev = { ...doc, oauthState: undefined };
	await writeTwitch(db, prev);

	try {
		const tokens = await exchangeCode({
			clientId: env.TWITCH_CLIENT_ID,
			clientSecret: env.TWITCH_CLIENT_SECRET,
			code,
			redirectUri: `${url.origin}/api/twitch/callback`,
		});
		const { doc: next, errors } = await finalizeConnection({
			clientId: env.TWITCH_CLIENT_ID,
			clientSecret: env.TWITCH_CLIENT_SECRET,
			prev,
			tokens,
			eventsubCallback: `${env.NEXT_PUBLIC_SERVER_URL}/twitch/eventsub`,
			persist: (d) => writeTwitch(db, d).then(() => undefined),
		});
		await writeTwitch(db, next);
		if (!next.connected) return back("no_subs");
		return back(errors.length ? "partial" : "connected");
	} catch {
		// State is already consumed above; nothing to roll back.
		return back("error");
	}
}
