import IORedis from "ioredis";

/**
 * Single shared Redis connection factory for BullMQ. BullMQ requires
 * `maxRetriesPerRequest: null` on connections it manages (its own
 * documented requirement — otherwise blocking commands like BRPOPLPUSH
 * can throw instead of retrying indefinitely).
 */
let sharedConnection: IORedis | undefined;

export function getRedisConnection(): IORedis {
  if (!sharedConnection) {
    const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
    sharedConnection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return sharedConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = undefined;
  }
}
