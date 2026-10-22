/**
 * Lớp truy cập dữ liệu SQLite dùng sql.js (WebAssembly) – không cần cài đặt
 * native module hay máy chủ CSDL. Dữ liệu được ghi xuống file data/unishare.sqlite.
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'unishare.sqlite');

let db = null;
let saveTimer = null;
let inTx = false;

function normalize(params) {
  if (!Array.isArray(params)) params = [params];
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

function saveNow() {
  if (!db) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
  // export() mở lại CSDL -> cần bật lại PRAGMA
  db.exec('PRAGMA foreign_keys = ON;');
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (inTx) return scheduleSave();
    try {
      saveNow();
    } catch (e) {
      console.error('[db] Lỗi ghi file CSDL:', e.message);
    }
  }, 250);
}

async function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  saveNow();
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.run(normalize(params));
  } finally {
    stmt.free();
  }
  const changes = db.getRowsModified();
  const res = db.exec('SELECT last_insert_rowid()');
  const lastInsertRowid = res.length ? res[0].values[0][0] : null;
  if (!inTx) scheduleSave();
  return { changes, lastInsertRowid };
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(normalize(params));
    return stmt.step() ? stmt.getAsObject() : undefined;
  } finally {
    stmt.free();
  }
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(normalize(params));
    while (stmt.step()) rows.push(stmt.getAsObject());
  } finally {
    stmt.free();
  }
  return rows;
}

/** Chạy fn trong một transaction; lỗi => ROLLBACK. Không hỗ trợ lồng nhau. */
function tx(fn) {
  if (inTx) return fn();
  db.exec('BEGIN');
  inTx = true;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    inTx = false;
    scheduleSave();
  }
}

function close() {
  if (db) {
    saveNow();
    db.close();
    db = null;
  }
}

module.exports = { init, run, get, all, tx, saveNow, close, DATA_DIR, DB_FILE };
