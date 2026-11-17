import { gunzipSync, gzipSync } from "node:zlib";

import type { RecipeCandidateCache } from "../../core/recipes/recipe-search.cache.js";
import type { RecipeSearchCandidate } from "../../core/recipes/recipes.types.js";

/** The few Redis operations the cache needs; ioredis satisfies this. */
export interface RedisCacheClient {
  /** GETEX key EX seconds: returns the value and resets its idle expiry. */
  getAndTouch(key: string, idleSeconds: number): Promise<Buffer | null>;
  setWithExpiry(key: string, value: Buffer, idleSeconds: number): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface RedisRecipeCandidateCacheOptions {
  idleSeconds: number;
  maxAgeSeconds: number;
  now?: () => number;
}

const HEADER_BYTES = 8;

/**
 * Stores each candidate list as a gzipped JSON tuple array behind an 8-byte creation
 * timestamp. Every hit resets the idle expiry (sliding); an entry older than the max
 * age is discarded on read so a continuously used entry is still rebuilt daily.
 */
export class RedisRecipeCandidateCache implements RecipeCandidateCache {
  private readonly now: () => number;

  constructor(
    private readonly client: RedisCacheClient,
    private readonly options: RedisRecipeCandidateCacheOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  async get(key: string): Promise<RecipeSearchCandidate[] | null> {
    const value = await this.client.getAndTouch(key, this.options.idleSeconds);
    if (value === null || value.length <= HEADER_BYTES) return null;
    const createdAt = Number(value.readBigUInt64BE(0));
    if (this.now() - createdAt >= this.options.maxAgeSeconds * 1000) {
      await this.client.remove(key);
      return null;
    }
    const rows = JSON.parse(gunzipSync(value.subarray(HEADER_BYTES)).toString("utf8")) as Array<
      [string, number, number, number | null, number | null]
    >;
    return rows.map(([id, matched, missing, minutes, ratingAverage]) => ({
      id,
      matched,
      missing,
      minutes,
      ratingAverage,
    }));
  }

  async set(key: string, candidates: readonly RecipeSearchCandidate[]): Promise<void> {
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeBigUInt64BE(BigInt(this.now()));
    const body = gzipSync(
      JSON.stringify(
        candidates.map((c) => [c.id, c.matched, c.missing, c.minutes, c.ratingAverage]),
      ),
    );
    await this.client.setWithExpiry(key, Buffer.concat([header, body]), this.options.idleSeconds);
  }
}

export function createIoredisCacheClient(redis: {
  callBuffer(command: string, ...args: (string | number)[]): Promise<unknown>;
  set(key: string, value: Buffer, mode: "EX", seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}): RedisCacheClient {
  return {
    async getAndTouch(key, idleSeconds) {
      const result = await redis.callBuffer("GETEX", key, "EX", idleSeconds);
      return Buffer.isBuffer(result) ? result : null;
    },
    async setWithExpiry(key, value, idleSeconds) {
      await redis.set(key, value, "EX", idleSeconds);
    },
    async remove(key) {
      await redis.del(key);
    },
  };
}
