import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
	// Global ignores
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.next/**",
			"**/.turbo/**",
			"**/.open-next/**",
			"**/.wrangler/**",
			"**/.alchemy/**",
			"**/coverage/**",
			"**/out/**",
			"apps/web/src/routeTree.gen.ts",
		],
	},

	// Base configs
	js.configs.recommended,
	...tseslint.configs.recommended,

	// Unused imports plugin
	{
		plugins: {
			"unused-imports": unusedImports,
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"unused-imports/no-unused-imports": "error",
			"unused-imports/no-unused-vars": [
				"error",
				{
					vars: "all",
					varsIgnorePattern: "^_",
					args: "after-used",
					argsIgnorePattern: "^_",
				},
			],
		},
	},

	// General rules
	{
		rules: {
			"no-param-reassign": "error",
			"@typescript-eslint/no-non-null-assertion": "warn",
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-empty-object-type": "off",
			"@typescript-eslint/no-require-imports": "off",
		},
	},

	// Node.js globals for config files and mjs scripts
	{
		files: ["**/*.config.{ts,mjs,js}", "**/*.mjs", "packages/infra/alchemy.run.ts"],
		languageOptions: {
			globals: {
				process: "readonly",
				console: "readonly",
				Buffer: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				module: "readonly",
				require: "readonly",
			},
		},
	},

	// Next.js plugin for the web app
	{
		files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
		plugins: {
			"@next/next": nextPlugin,
		},
		rules: {
			...nextPlugin.configs.recommended.rules,
			...nextPlugin.configs["core-web-vitals"].rules,
			"@next/next/no-img-element": "off",
			"@next/next/no-html-link-for-pages": "off",
		},
	},

	// Hooks + a11y for every React surface. Both earn their keep here: the panel's
	// draft/dirty bugs were hook-dependency bugs, and its worst accessibility
	// regressions (a live region wrapping a 1s countdown, radiogroups with no
	// keyboard behaviour, unlabelled inputs) are exactly what these catch.
	// `exhaustive-deps` is a warning, not an error: several effects here
	// deliberately key on a subset of their deps and say so in a comment.
	{
		files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
		plugins: {
			"react-hooks": reactHooks,
			"jsx-a11y": jsxA11y,
		},
		rules: {
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",
			...jsxA11y.flatConfigs.recommended.rules,
			// This codebase labels controls by NESTING them inside the <label>, which is
			// valid and accessible; the rule's default only credits `htmlFor`. The
			// nested control is usually one of our own primitives rather than a raw
			// <input>, so those have to be named or the rule can't see them.
			"jsx-a11y/label-has-associated-control": [
				"error",
				{
					assert: "either",
					controlComponents: ["Input", "Checkbox", "NumberStepper"],
					// Label text is often a <span> or two deep (name + hint line).
					depth: 4,
				},
			],
		},
	},

	// The shared <Label> primitive is a passthrough: the CALLER supplies both the
	// text and the control it labels, so there is nothing here for the rule to
	// check. Its call sites are still linted.
	{
		files: ["packages/ui/src/components/label.tsx"],
		rules: { "jsx-a11y/label-has-associated-control": "off" },
	},

	// Allow default exports in framework + entry files
	{
		files: [
			"**/app/**/{page,layout,loading,error,not-found,sitemap,robots,manifest,route}.{ts,tsx}",
			"**/*.config.{ts,mjs,js}",
			"**/next.config.{ts,mjs,js}",
			"**/open-next.config.ts",
			"**/postcss.config.mjs",
			"**/drizzle.config.ts",
			"**/tsdown.config.ts",
			"packages/infra/alchemy.run.ts",
			"apps/server/src/index.ts",
			"packages/api/src/index.ts",
		],
		rules: {
			// These files require default exports by convention
		},
	},

	// env.d.ts references are required for Cloudflare Workers typed bindings
	{
		files: ["packages/env/src/*.ts"],
		rules: {
			"@typescript-eslint/triple-slash-reference": "off",
		},
	},

	// Prettier must be last
	prettier,
);
