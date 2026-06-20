import "@wolfathon/env/web";
import { execSync } from "node:child_process";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const commitSha = (() => {
	try {
		return execSync("git rev-parse --short HEAD").toString().trim();
	} catch {
		return "dev";
	}
})();

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,
	env: {
		NEXT_PUBLIC_COMMIT_SHA: commitSha,
	},
};

export default nextConfig;

// Dev-only: load a local Cloudflare context (miniflare D1 + dev vars) from a
// non-default config so Alchemy's deploy config is untouched. No-op in prod.
initOpenNextCloudflareForDev({ configPath: "wrangler.dev.jsonc" });
