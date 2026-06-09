import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Cloudflare Access (Zero Trust) authentication.
 *
 * When a request passes through an Access-protected hostname/path, Cloudflare
 * injects two headers we trust:
 *  - `Cf-Access-Jwt-Assertion`        — a signed JWT we verify here
 *  - `Cf-Access-Authenticated-User-Email` — the authenticated user's email
 *
 * We verify the JWT against the Access team's public keys (JWKS) and check the
 * audience (`aud`) matches the protected application's AUD tag. Public overlay
 * routes never call this — they stay open.
 */

export type AccessConfig = {
  /** Access team domain, e.g. `myteam.cloudflareaccess.com`. */
  teamDomain: string | undefined;
  /** The Access application's Audience (AUD) tag. */
  aud: string | undefined;
  /**
   * Local-dev escape hatch. When true, verification is skipped and a stub user
   * is returned. MUST be false in production (default). See `.env.example`.
   */
  disabled: boolean;
};

export type AccessUser = { email: string };

// Cache one JWKS fetcher per team domain (it handles key rotation + caching).
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

/**
 * Resolve the authenticated Access user from request headers, or `null` if the
 * request is not authenticated. Never throws — callers treat `null` as "denied".
 */
export async function verifyAccess(
  headers: Headers,
  config: AccessConfig,
): Promise<AccessUser | null> {
  if (config.disabled) {
    const email = headers.get("cf-access-authenticated-user-email") ?? "dev@localhost";
    return { email };
  }

  const token = headers.get("cf-access-jwt-assertion");
  if (!token || !config.teamDomain || !config.aud) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(config.teamDomain), {
      issuer: `https://${config.teamDomain}`,
      audience: config.aud,
    });
    const email =
      (typeof payload.email === "string" ? payload.email : undefined) ??
      headers.get("cf-access-authenticated-user-email") ??
      undefined;
    return email ? { email } : null;
  } catch {
    return null;
  }
}
