/**
 * Pipeline kiểm duyệt nội dung tự động (Content Moderation Pipeline)
 *  1. Hash blacklist (SHA-256)      -> rejected
 *  2. Từ khoá blacklist             -> flagged
 *  3. Tương đồng văn bản (shingle)  -> flagged
 *  4. Sạch                          -> approved
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');
const { stripDiacritics } = require('../utils');

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();
  try {
    if (config.TEXT_EXT.includes(ext)) {
      return fs.readFileSync(filePath, 'utf8').slice(0, 500000);
    }
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse/lib/pdf-parse.js');
      const data = await pdfParse(fs.readFileSync(filePath));
      return String(data.text || '').slice(0, 500000);
    }
  } catch (e) {
    console.warn('[moderation] Không trích xuất được văn bản:', e.message);
  }
  return '';
}

function normalizeText(s) {
  return stripDiacritics(String(s || '').toLowerCase()).replace(/\s+/g, ' ');
}

function shingles(text, k = 5) {
  const words = normalizeText(text).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);
  const set = new Set();
  for (let i = 0; i + k <= words.length; i++) set.add(words.slice(i, i + k).join(' '));
  return set;
}

/** Độ phủ: tỉ lệ shingle của văn bản mới xuất hiện trong văn bản cũ. */
function containment(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / a.size;
}

function moderate({ title, description, content, fileText, fileHash, excludeDocId = 0 }) {
  const notes = [];
  let status = 'approved';
  let similarity = 0;
  let similarDocId = null;

  // 1. Hash blacklist
  if (fileHash) {
    const hit = db.get("SELECT note FROM blacklist WHERE type = 'hash' AND value = ?", [fileHash]);
    if (hit) {
      return {
        status: 'rejected',
        notes: [`File trùng với tài liệu đã bị gỡ do vi phạm bản quyền${hit.note ? ' (' + hit.note + ')' : ''}.`],
        similarity: 1,
      };
    }
  }

  const fullText = [title, description, content, fileText].filter(Boolean).join('\n');
  const norm = normalizeText(fullText);

  // 2. Keyword blacklist
  const keywords = db.all("SELECT value FROM blacklist WHERE type = 'keyword'");
  const hits = keywords.filter((k) => norm.includes(normalizeText(k.value))).map((k) => k.value);
  if (hits.length) {
    status = 'flagged';
    notes.push(`Phát hiện dấu hiệu tài liệu có bản quyền của bên thứ ba: "${hits.join('", "')}".`);
  }

  // 3. Similarity with approved docs (ưu tiên cùng môn học + tài liệu gần nhất để tối ưu khi CSDL lớn)
  const body = [content, fileText].filter(Boolean).join('\n');
  const mine = shingles(body);
  if (mine.size >= 20) {
    const others = db.all(
      "SELECT id, title, content, extracted_text FROM documents WHERE status = 'approved' AND id != ? AND (id <= 20 OR id > (SELECT COALESCE(MAX(id), 0) - 250 FROM documents))",
      [excludeDocId]
    );
    for (const o of others) {
      const score = containment(mine, shingles([o.content, o.extracted_text].filter(Boolean).join('\n')));
      if (score > similarity) {
        similarity = score;
        similarDocId = o.id;
      }
    }
    if (similarity >= config.SIMILARITY_THRESHOLD) {
      status = 'flagged';
      notes.push(`Nội dung trùng ${(similarity * 100).toFixed(0)}% với tài liệu #${similarDocId} – nghi sao chép.`);
    }
  }

  if (status === 'approved') notes.push('Vượt qua kiểm duyệt tự động.');
  return { status, notes, similarity: Math.round(similarity * 1000) / 1000 };
}

module.exports = { extractText, moderate, shingles, containment };
