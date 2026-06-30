/**
 * Cryptographically-secure RNG for prize-affecting draws (raffle, wheel spin).
 *
 * `Math.random` is a seedable, predictable PRNG — fine for cosmetics, not for
 * anything that decides who wins a prize. `secureRandom` draws from the Web
 * Crypto CSPRNG so a draw can't be predicted or rigged by reproducing the seed.
 *
 * Returns a uniform float in [0, 1) over 2^32 buckets — for any realistic pool
 * size (n ≪ 2^32) `Math.floor(secureRandom() * n)` is uniform to well past any
 * detectable bias, so callers keep the same `rand: () => number` contract and
 * stay injectable (tests pass a fixed function for determinism).
 */
export function secureRandom(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
}
