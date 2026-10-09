// Tiny datastore: everything lives in one JSON document.
//  - Default: saved to DATA_DIR/db.json (needs a persistent disk to survive restarts).
//  - If DATABASE_URL is set (e.g. a free Neon/Supabase Postgres), the document is also saved
//    there and loaded from there on startup, so accounts and chats survive restarts on
//    hosts without a disk, like Render's free plan.
// For a large public launch, move to proper tables (see docs/DEPLOY_WEB_APP.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'users', 'sessions', 'posts', 'likes', 'saves', 'comments', 'notInterested',
  'friendRequests', 'friendships', 'messages', 'blocks', 'reports', 'invites', 'tiktokAdds',
];

function emptyDb() {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'videos'), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'snaps'), { recursive: true });

export const db = (() => {
  try {
    const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...emptyDb(), ...loaded };
  } catch {
    return emptyDb();
  }
})();

let pool = null;

/** Connects to Postgres when DATABASE_URL is set and loads the saved data from it. */
export async function initDb() {
  if (!process.env.DATABASE_URL) return;
  const { default: pg } = await import('pg');
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
    max: 2,
  });
  await pool.query('CREATE TABLE IF NOT EXISTS ember_state (id INT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())');
  const { rows } = await pool.query('SELECT data FROM ember_state WHERE id = 1');
  if (rows[0]) {
    for (const c of COLLECTIONS) db[c] = rows[0].data[c] || [];
    console.log('Loaded data from Postgres');
  } else {
    await writeRemote();
  }
}

let remoteWriting = null;
let remoteAgain = false;
async function writeRemote() {
  if (!pool) return;
  if (remoteWriting) { remoteAgain = true; return; }
  remoteWriting = pool.query(
    'INSERT INTO ember_state (id, data, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
    [JSON.stringify(db)],
  ).catch((e) => console.error('Postgres save failed:', e.message));
  await remoteWriting;
  remoteWriting = null;
  if (remoteAgain) { remoteAgain = false; await writeRemote(); }
}

let timer = null;
export function save() {
  if (timer) return;
  timer = setTimeout(flush, 150);
}

export function flush() {
  clearTimeout(timer);
  timer = null;
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
  return writeRemote();
}

export function reset() {
  for (const c of COLLECTIONS) db[c] = [];
  flush();
}

export async function closeDb() {
  await flush();
  if (remoteWriting) await remoteWriting;
  await pool?.end();
}

process.on('exit', () => { if (timer) flush(); });
