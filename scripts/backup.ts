import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { backupConfigFromEnvironment, createBackup, verifyBackup, restoreIntoNewTestDatabase, dropRestoreTestDatabase, mysqlQuery, pruneBackups } from '@/server/backups';
async function main() {
  const config = backupConfigFromEnvironment(); const operation = process.argv[2] ?? 'create';
  if (operation === 'create') {
    const manifest = await createBackup(config); const path = join(config.directory, `${manifest.file}.json`);
    await verifyBackup(config, path);
    console.log(JSON.stringify({ createdAt: manifest.createdAt, file: manifest.file, verified: true, expiredBackupsRemoved: await pruneBackups(config) }));
  } else if (operation === 'verify') {
    console.log(JSON.stringify({ verified: true, file: (await verifyBackup(config, process.argv[3])).file }));
  } else if (operation === 'restore-test') {
    const target = `plyli_${randomUUID().replaceAll('-', '')}_restore_test`;
    let created = false;
    try {
      await restoreIntoNewTestDatabase(config, process.argv[3], target); created = true;
      const tables = Number(await mysqlQuery(config, target, `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()`));
      if (tables < 10) throw new Error('Restored schema is incomplete.');
      console.log(JSON.stringify({ restoreVerified: true, tables, target }));
    } finally { if (created) await dropRestoreTestDatabase(config, target); }
  } else throw new Error('Use create, verify <manifest>, or restore-test <manifest>.');
}
void main().catch(() => { console.error('Backup operation failed. No production database was overwritten. Check configuration and file integrity.'); process.exitCode = 1; });
