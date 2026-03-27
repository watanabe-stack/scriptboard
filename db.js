import initSqlJs from 'sql.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';

mkdirSync('./data', { recursive: true });

const DB_PATH = './data/scripts.db';
const SQL = await initSqlJs();

let db;
if (existsSync(DB_PATH)) {
  const buf = readFileSync(DB_PATH);
  db = new SQL.Database(buf);
} else {
  db = new SQL.Database();
}

// テーブル初期化
db.run(`
  CREATE TABLE IF NOT EXISTS scripts (
    id        TEXT PRIMARY KEY,
    title     TEXT NOT NULL DEFAULT '',
    body      TEXT NOT NULL DEFAULT '',
    updatedAt INTEGER NOT NULL
  )
`);
persist();

function persist() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

export function getAll() {
  const stmt = db.prepare('SELECT * FROM scripts ORDER BY updatedAt DESC');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function upsert(s) {
  db.run(`
    INSERT INTO scripts (id, title, body, updatedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title     = excluded.title,
      body      = excluded.body,
      updatedAt = excluded.updatedAt
  `, [s.id, s.title, s.body, s.updatedAt]);
  persist();
}

export function remove(id) {
  db.run('DELETE FROM scripts WHERE id = ?', [id]);
  persist();
}
