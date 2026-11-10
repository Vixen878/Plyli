import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '@/server/db';
import { backupConfigFromEnvironment, createBackup, verifyBackup, restoreIntoNewTestDatabase, dropRestoreTestDatabase, mysqlQuery, pruneBackups } from '@/server/backups';
import { enforceRetention } from '@/server/management';
async function main() {
  const config = backupConfigFromEnvironment();
  const manifest = await createBackup(config); const path = join(config.directory, `${manifest.file}.json`);
  await verifyBackup(config, path);
  const target = `plyli_${randomUUID().replaceAll('-', '')}_restore_test`;
  await restoreIntoNewTestDatabase(config, path, target);
  try {
    const count = Number(await mysqlQuery(config, target, 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()'));
    const orphans = Number(await mysqlQuery(config, target, 'SELECT COUNT(*) FROM Submission s LEFT JOIN FormRevision r ON r.workspaceId=s.workspaceId AND r.formId=s.formId AND r.revision=s.formRevision WHERE r.formId IS NULL'));
    const drafts = Number(await mysqlQuery(config, target, 'SELECT COUNT(*) FROM Form f LEFT JOIN FormRevision r ON r.workspaceId=f.workspaceId AND r.formId=f.id AND r.revision=f.draftRevision WHERE r.formId IS NULL'));
    if (count < 10 || orphans || drafts) throw new Error('Restore verification found missing tables or broken revision references.');
  } finally { await dropRestoreTestDatabase(config, target); }
  // Retention runs only after a recoverable backup has been verified/restored.
  const responses = await enforceRetention(db);
  const cutoff = new Date(Date.now() - 90 * 86400000);
  await db.analyticsEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });
  await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.rateLimit.deleteMany({ where: { lastRequest: { lt: BigInt(Date.now() - 86400000) } } });
  const result = { completedAt: new Date().toISOString(), backup: manifest.file, restoredAndVerified: true, ...responses, expiredBackupsRemoved: await pruneBackups(config) };
  await mkdir('.tmp/maintenance', { recursive: true });
  await writeFile('.tmp/maintenance/last-success.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
void main().catch(() => { console.error('Plyli maintenance failed. Review backup configuration and restore integrity; no source database was overwritten.'); process.exitCode = 1; }).finally(() => db.$disconnect());
