import { expect, test } from "bun:test";

import { verifyAccess } from "./access";

/**
 * Cloudflare Access gate. We cover the network-free branches (the JWKS-verifying
 * happy path needs a live key fetch and is deferred). These guard the dev escape
 * hatch and the fail-closed denials that protect /control + /api/trpc.
 */

test("disabled mode returns the authenticated email header", async () => {
	const headers = new Headers({ "cf-access-authenticated-user-email": "op@example.com" });
	expect(
		await verifyAccess(headers, { teamDomain: undefined, aud: undefined, disabled: true }),
	).toEqual({ email: "op@example.com" });
});

test("disabled mode falls back to a dev stub when no email header is present", async () => {
	expect(
		await verifyAccess(new Headers(), { teamDomain: undefined, aud: undefined, disabled: true }),
	).toEqual({ email: "dev@localhost" });
});

test("enabled mode denies when the Access JWT header is absent", async () => {
	const config = { teamDomain: "team.cloudflareaccess.com", aud: "aud123", disabled: false };
	expect(await verifyAccess(new Headers(), config)).toBeNull();
});

test("enabled mode denies when teamDomain or aud is unset even with a token present", async () => {
	const headers = new Headers({ "cf-access-jwt-assertion": "header.payload.sig" });
	expect(
		await verifyAccess(headers, { teamDomain: undefined, aud: "aud123", disabled: false }),
	).toBeNull();
	expect(
		await verifyAccess(headers, {
			teamDomain: "team.cloudflareaccess.com",
			aud: undefined,
			disabled: false,
		}),
	).toBeNull();
});
