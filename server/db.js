// Tiny JSON-file datastore. Good for a personal deployment / prototype.
// For a large public launch, swap this module for Postgres (see docs/DEPLOY_WEB_APP.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'users', 'sessions', 'posts', 'likes', 'saves', 'comments', 'notInterested',
  'friendRequests', 'friendships', 'messages', 'blocks', 'reports',
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
}

export function reset() {
  for (const c of COLLECTIONS) db[c] = [];
  flush();
}

process.on('exit', () => { if (timer) flush(); });
