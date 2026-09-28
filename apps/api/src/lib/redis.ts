import { Redis } from 'ioredis';
import { logger } from './logger';

/**
 * Nothing in the API reads or writes Redis yet — the only call sites are the
 * startup ping and the shutdown quit in index.ts. So when Redis is absent we
 * give up quickly and quietly rather than reconnecting forever, which otherwise
 * floods the log with ECONNREFUSED every couple of seconds and buries real errors.
 */
const MAX_RETRIES = 3;

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: MAX_RETRIES,
  lazyConnect: true,
  retryStrategy: (times) => (times > MAX_RETRIES ? null : Math.min(times * 200, 1000)),
});

let loggedError = false;

redis.on('error', (err) => {
  if (loggedError) return;
  loggedError = true;
  logger.error('Redis error (further Redis errors suppressed)', { err });
});

redis.on('connect', () => {
  loggedError = false;
  logger.debug('Redis connected');
});
