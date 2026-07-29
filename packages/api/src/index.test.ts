import { expect, test } from "bun:test";

import { stripErrorStack } from "./index";

/**
 * The deployed public overlay API was returning `data.stack` — internal file
 * paths and line numbers — to anyone who sent a bad overlay token. tRPC adds it
 * unless it believes it's in production, and a Worker's NODE_ENV isn't a reliable
 * signal, so it is stripped unconditionally.
 */

test("stripErrorStack removes the stack from an error shape", () => {
	const shape = {
		message: "Invalid overlay token.",
		code: -32001,
		data: {
			code: "UNAUTHORIZED",
			httpStatus: 401,
			path: "state.getPublic",
			stack: "TRPCError: Invalid overlay token.\n    at assertToken (index.js:28330:11)",
		},
	};
	const out = stripErrorStack(shape);
	expect("stack" in out.data).toBe(false);
	expect(JSON.stringify(out)).not.toContain("index.js");
	// Everything a client legitimately needs survives.
	expect(out.message).toBe("Invalid overlay token.");
	expect(out.code).toBe(-32001);
	expect(out.data.code).toBe("UNAUTHORIZED");
	expect(out.data.httpStatus).toBe(401);
	expect(out.data.path).toBe("state.getPublic");
});

test("stripErrorStack leaves a shape that never had a stack alone", () => {
	const shape = { message: "nope", code: -32600, data: { code: "BAD_REQUEST", httpStatus: 400 } };
	expect(stripErrorStack(shape)).toEqual(shape);
});

test("stripErrorStack preserves the zodError payload the client renders", () => {
	const shape = {
		message: "Input validation failed",
		code: -32600,
		data: {
			code: "BAD_REQUEST",
			httpStatus: 400,
			stack: "at zod",
			zodError: { fieldErrors: { goals: ["Required"] } },
		},
	};
	const out = stripErrorStack(shape);
	expect("stack" in out.data).toBe(false);
	expect(out.data.zodError).toEqual({ fieldErrors: { goals: ["Required"] } });
});
