import { describe, expect, it } from "vitest";

import {
  RedisRecipeCandidateCache,
  type RedisCacheClient,
} from "../api/src/infrastructure/cache/redis-recipe-candidate-cache.js";

function fakeClient(clock: { now: number }) {
  const entries = new Map<string, { value: Buffer; expiresAt: number }>();
  const client: RedisCacheClient = {
    async getAndTouch(key, idle) {
      const entry = entries.get(key);
      if (entry === undefined || entry.expiresAt <= clock.now) return null;
      entry.expiresAt = clock.now + idle * 1000;
      return entry.value;
    },
    async setWithExpiry(key, value, idle) {
      entries.set(key, { value, expiresAt: clock.now + idle * 1000 });
    },
    async remove(key) {
      entries.delete(key);
    },
  };
  return { client, entries };
}

const candidates = [
  { id: "a", matched: 2, missing: 1, minutes: 15, ratingAverage: 4.5 },
  { id: "b", matched: 1, missing: 0, minutes: null, ratingAverage: null },
];

describe("RedisRecipeCandidateCache", () => {
  const setup = () => {
    const clock = { now: 1_000_000 };
    const { client, entries } = fakeClient(clock);
    const cache = new RedisRecipeCandidateCache(client, {
      idleSeconds: 300,
      maxAgeSeconds: 86_400,
      now: () => clock.now,
    });
    return { clock, cache, entries };
  };

  it("round-trips candidates", async () => {
    const { cache } = setup();
    await cache.set("k", candidates);
    expect(await cache.get("k")).toEqual(candidates);
    expect(await cache.get("missing")).toBeNull();
  });

  it("slides the idle expiry on every hit", async () => {
    const { cache, clock } = setup();
    await cache.set("k", candidates);
    for (let i = 0; i < 5; i += 1) {
      clock.now += 200_000; // 200s < 300s idle, total well past 300s
      expect(await cache.get("k")).toEqual(candidates);
    }
  });

  it("expires after the idle period without hits", async () => {
    const { cache, clock } = setup();
    await cache.set("k", candidates);
    clock.now += 301_000;
    expect(await cache.get("k")).toBeNull();
  });

  it("discards entries past the max age even when in use", async () => {
    const { cache, clock, entries } = setup();
    await cache.set("k", candidates);
    for (let elapsed = 0; elapsed < 86_400_000; elapsed += 200_000) {
      clock.now += 200_000;
      await cache.get("k");
    }
    clock.now += 200_000;
    expect(await cache.get("k")).toBeNull();
    expect(entries.has("k")).toBe(false);
  });
});
