import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { createGzip, createGunzip } from 'node:zlib';
import { z } from 'zod';

export interface BackupConfig { databaseUrl: string; directory: string; key: string; mysql: string; mysqldump: string; retentionDays: number }
const manifestSchema = z.strictObject({ format: z.literal('plyli-mysql-aes256gcm-v1'), createdAt: z.iso.datetime(), sourceDatabase: z.string().regex(/^[A-Za-z0-9_]+$/), file: z.string().regex(/^plyli-[A-Za-z0-9_-]+\.sql\.gz\.enc$/), iv: z.string().regex(/^[a-f0-9]{24}$/), tag: z.string().regex(/^[a-f0-9]{32}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
type Manifest = z.infer<typeof manifestSchema>;
const aad = (manifest: Pick<Manifest, 'format' | 'createdAt' | 'sourceDatabase' | 'file'>) => Buffer.from(JSON.stringify({ format: manifest.format, createdAt: manifest.createdAt, sourceDatabase: manifest.sourceDatabase, file: manifest.file }));
function encryptionKey(raw: string) { if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error('PLYLI_BACKUP_KEY must contain 32 random bytes encoded as 64 hexadecimal characters.'); return Buffer.from(raw, 'hex'); }
function connection(config: BackupConfig) {
  const url = new URL(config.databaseUrl);
  if (url.protocol !== 'mysql:' || !/^\/[A-Za-z0-9_]+$/.test(url.pathname)) throw new Error('Invalid backup database URL.');
  return { database: url.pathname.slice(1), args: [`--host=${url.hostname}`, `--port=${url.port || '3306'}`, `--user=${decodeURIComponent(url.username)}`, '--protocol=TCP'], env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) } };
}
function start(binary: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(binary, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  // Do not retain SQL, credentials or server error text in application logs.
  child.stderr.resume();
  const done = new Promise<void>((accept, reject) => { child.once('error', () => reject(new Error('MySQL utility could not start. Check configured binary paths.'))); child.once('close', (code) => code === 0 ? accept() : reject(new Error(`MySQL utility failed (exit ${code}).`))); });
  return { child, done };
}
async function digest(file: string) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }

export async function createBackup(config: BackupConfig) {
  const key = encryptionKey(config.key); const db = connection(config); const directory = resolve(config.directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = `plyli-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sql.gz.enc`;
  const target = join(directory, file); const partial = `${target}.partial`;
  const base = { format: 'plyli-mysql-aes256gcm-v1' as const, createdAt: new Date().toISOString(), sourceDatabase: db.database, file };
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad(base));
  const { child, done } = start(config.mysqldump, [...db.args, '--single-transaction', '--quick', '--skip-lock-tables', '--skip-add-locks', '--hex-blob', '--set-gtid-purged=OFF', '--no-tablespaces', '--default-character-set=utf8mb4', db.database], db.env);
  child.stdin.end();
  try {
    await Promise.all([pipeline(child.stdout, createGzip(), cipher, createWriteStream(partial, { flags: 'wx', mode: 0o600 })), done]);
    const manifest: Manifest = { ...base, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), sha256: await digest(partial) };
    await rename(partial, target);
    await writeFile(`${target}.json`, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    return manifest;
  } catch (error) { child.kill(); await done.catch(() => {}); await rm(partial, { force: true }); await rm(target, { force: true }); throw error; }
}

async function load(config: BackupConfig, manifestPath: string) {
  const path = resolve(manifestPath);
  if (resolve(config.directory) !== resolve(path, '..')) throw new Error('Backup manifest must be inside the configured backup directory.');
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  if (basename(path) !== `${manifest.file}.json`) throw new Error('Manifest filename mismatch.');
  const file = join(resolve(config.directory), manifest.file);
  if (await digest(file) !== manifest.sha256) throw new Error('Backup checksum mismatch.');
  const decrypt = () => { const decipher = createDecipheriv('aes-256-gcm', encryptionKey(config.key), Buffer.from(manifest.iv, 'hex')); decipher.setAAD(aad(manifest)); decipher.setAuthTag(Buffer.from(manifest.tag, 'hex')); return decipher; };
  // Authenticate and decompress the entire file before any SQL is executed.
  await pipeline(createReadStream(file), decrypt(), createGunzip(), new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
  return { manifest, file, decrypt };
}

export async function verifyBackup(config: BackupConfig, manifestPath: string) { return (await load(config, manifestPath)).manifest; }

export async function mysqlQuery(config: BackupConfig, database: string | null, sql: string) {
  const db = connection(config);
  const { child, done } = start(config.mysql, [...db.args, '--batch', '--skip-column-names', ...(database ? [database] : []), `--execute=${sql}`], db.env);
  child.stdin.end(); let output = '';
  child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk: string) => { if (output.length < 1048576) output += chunk; });
  await done; return output.trim();
}

export async function restoreIntoNewTestDatabase(config: BackupConfig, manifestPath: string, target: string) {
  if (!/^plyli_[a-z0-9_]+_restore_test$/.test(target) || target === connection(config).database) throw new Error('Restore checks require a NEW isolated plyli_*_restore_test database.');
  const backup = await load(config, manifestPath);
  // CREATE without IF NOT EXISTS prevents overwriting any existing database.
  await mysqlQuery(config, null, `CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
  const db = connection(config); const { child, done } = start(config.mysql, [...db.args, '--binary-mode', '--default-character-set=utf8mb4', target], db.env);
  child.stdout.resume();
  try { await Promise.all([pipeline(createReadStream(backup.file), backup.decrypt(), createGunzip(), child.stdin), done]); }
  catch (error) { child.kill(); await done.catch(() => {}); await dropRestoreTestDatabase(config, target); throw error; }
  return { target, manifest: backup.manifest };
}

export async function dropRestoreTestDatabase(config: BackupConfig, target: string) {
  if (!/^plyli_[a-z0-9_]+_restore_test$/.test(target) || target === connection(config).database) throw new Error('Refusing to drop a non-restore-test database.');
  await mysqlQuery(config, null, `DROP DATABASE \`${target}\``);
}

export async function pruneBackups(config: BackupConfig, now = new Date()) {
  if (!Number.isInteger(config.retentionDays) || config.retentionDays < 1) throw new Error('Backup retention must be at least one day.');
  const directory = resolve(config.directory); const manifests: Manifest[] = [];
  const sourceDatabase = connection(config).database;
  for (const file of await readdir(directory)) {
    if (!/^plyli-[A-Za-z0-9_-]+\.sql\.gz\.enc\.json$/.test(file)) continue;
    const parsed = manifestSchema.safeParse(JSON.parse(await readFile(join(directory, file), 'utf8')));
    // A shared directory may contain another instance's backups and policy.
    if (parsed.success && parsed.data.sourceDatabase === sourceDatabase && file === `${parsed.data.file}.json`) manifests.push(parsed.data);
  }
  manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Keep at least the newest validated backup even if the scheduler was offline.
  const keep = new Set(manifests.slice(0, 1).map((m) => m.file));
  let removed = 0;
  for (const manifest of manifests) if (!keep.has(manifest.file) && new Date(manifest.createdAt).getTime() < now.getTime() - config.retentionDays * 86400000) {
    await rm(join(directory, manifest.file), { force: true }); await rm(join(directory, `${manifest.file}.json`)); removed++;
  }
  return removed;
}

export function backupConfigFromEnvironment(): BackupConfig {
  return { databaseUrl: z.string().parse(process.env.DATABASE_URL), directory: process.env.PLYLI_BACKUP_DIR ?? resolve('../PlyliBackups'), key: z.string().parse(process.env.PLYLI_BACKUP_KEY), mysql: process.env.PLYLI_MYSQL_BIN ?? 'mysql', mysqldump: process.env.PLYLI_MYSQLDUMP_BIN ?? 'mysqldump', retentionDays: z.coerce.number().int().min(1).parse(process.env.PLYLI_BACKUP_RETENTION_DAYS ?? 7) };
}
