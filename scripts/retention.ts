import { db } from '@/server/db';
import { enforceRetention } from '@/server/management';
// Run daily. Response payloads follow the owner's explicit retention policy.
async function main() {
  try {
    const now = new Date();
    const responses = await enforceRetention(db, now);
    const analyticsCutoff = new Date(now.getTime() - 90 * 86400000);
    const events = await db.analyticsEvent.deleteMany({ where: { occurredAt: { lt: analyticsCutoff } } });
    const buckets = await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
    const authBuckets = await db.rateLimit.deleteMany({ where: { lastRequest: { lt: BigInt(now.getTime() - 86400000) } } });
    console.log(JSON.stringify({ ...responses, deletedAnalyticsEvents: events.count, expiredRateLimitBuckets: buckets.count + authBuckets.count }));
  } finally { await db.$disconnect(); }
}
void main();
