const crypto = require('crypto');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
}

/** Chuyển chuỗi thời gian SQLite (UTC "YYYY-MM-DD HH:MM:SS") sang Date. */
function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const iso = /T/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

function fmtDate(s, withTime = true) {
  const d = parseDate(s);
  if (!d) return '';
  const opts = { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('vi-VN', opts);
}

function sqlNow(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString().replace('T', ' ').slice(0, 19);
}

function isPremium(user) {
  if (!user || !user.premium_until) return false;
  const d = parseDate(user.premium_until);
  return !!d && d > new Date();
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function truncate(s, n = 140) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function toInt(v, def = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function inlineMd(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

/** Markdown tối giản, an toàn: escape HTML trước rồi mới áp dụng định dạng. */
function renderMarkdown(src) {
  const lines = escapeHtml(src || '').split(/\r?\n/);
  let html = '';
  let para = [];
  let list = null; // 'ul' | 'ol'
  let inCode = false;
  const flushPara = () => {
    if (para.length) {
      html += '<p>' + inlineMd(para.join('<br>')) + '</p>';
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      html += `</${list}>`;
      list = null;
    }
  };
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        html += '</code></pre>';
        inCode = false;
      } else {
        flushPara();
        closeList();
        html += '<pre><code>';
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html += line + '\n';
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara();
      closeList();
      const lv = m[1].length + 1;
      html += `<h${lv}>${inlineMd(m[2])}</h${lv}>`;
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') {
        closeList();
        html += '<ul>';
        list = 'ul';
      }
      html += `<li>${inlineMd(m[1])}</li>`;
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') {
        closeList();
        html += '<ol>';
        list = 'ol';
      }
      html += `<li>${inlineMd(m[1])}</li>`;
    } else if ((m = line.match(/^&gt;\s?(.*)$/))) {
      flushPara();
      closeList();
      html += `<blockquote>${inlineMd(m[1])}</blockquote>`;
    } else if (!line.trim()) {
      flushPara();
      closeList();
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara();
  closeList();
  if (inCode) html += '</code></pre>';
  return html;
}

/** Lấy phần đầu nội dung theo tỉ lệ (cắt theo dòng). */
function previewText(text, ratio) {
  text = String(text || '');
  if (!text) return '';
  const target = Math.max(80, Math.floor(text.length * ratio));
  const lines = text.split(/\r?\n/);
  const out = [];
  let count = 0;
  for (const l of lines) {
    if (count >= target) break;
    out.push(l);
    count += l.length + 1;
  }
  let res = out.join('\n');
  if ((res.match(/```/g) || []).length % 2 === 1) res += '\n```';
  return res;
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function safeUrl(u) {
  return /^https?:\/\//i.test(String(u || '')) ? u : '#';
}

module.exports = {
  escapeHtml, fmtMoney, parseDate, fmtDate, sqlNow, isPremium, sha256, truncate,
  stripDiacritics, toInt, renderMarkdown, previewText, fmtSize, shuffle, safeUrl,
};
