import { readFile, writeFile } from "fs/promises";
import { Redis } from "@upstash/redis";
import {
  LAST_SEEN_STATE_FILE,
  STATE_BACKEND,
  UPSTASH_REDIS_REST_TOKEN,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_STATE_KEY,
  type StateBackend,
} from "./config";

export type StateStore = {
  readState(): Promise<string | null>;
  writeState(json: string): Promise<void>;
};

class FileStateStore implements StateStore {
  constructor(private readonly path: string) {}

  async readState(): Promise<string | null> {
    try {
      return await readFile(this.path, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async writeState(json: string): Promise<void> {
    await writeFile(this.path, json, "utf-8");
  }
}

class UpstashStateStore implements StateStore {
  private readonly redis: Redis;
  private readonly key: string;

  constructor(url: string, token: string, key: string) {
    this.redis = new Redis({ url, token });
    this.key = key;
  }

  async readState(): Promise<string | null> {
    const raw = await this.redis.get<string>(this.key);
    if (typeof raw !== "string") return null;
    return raw;
  }

  async writeState(json: string): Promise<void> {
    await this.redis.set(this.key, json);
  }
}

function resolveBackend(): StateBackend {
  return STATE_BACKEND;
}

function createUpstashStore(): StateStore {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("STATE_BACKEND=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  }
  return new UpstashStateStore(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, UPSTASH_STATE_KEY);
}

export function createStateStore(pathHint?: string): StateStore {
  const backend = resolveBackend();
  if (backend === "upstash") return createUpstashStore();
  return new FileStateStore(pathHint ?? LAST_SEEN_STATE_FILE);
}
