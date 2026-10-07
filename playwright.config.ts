import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
	testDir: "./tests/e2e",
	// The browser tests share the local D1 database and some tests exercise
	// settings mutations, so run them serially to avoid cross-test state races.
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	use: {
		baseURL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "bun run --cwd apps/web dev:bare",
		url: `${baseURL}/overlay/demo`,
		env: { NEXT_PUBLIC_SERVER_URL: "https://wolfathon-api.mrdemonwolf.workers.dev" },
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
