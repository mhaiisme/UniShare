const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAdmin, flash } = require('../middleware/auth');
const wallet = require('../services/wallet');
const { toInt, safeUrl } = require('../utils');
const { DOC_SELECT } = require('./pages');

const router = express.Router();
router.use(requireAdmin);

const back = (req, res, fallback) => {
  const ref = req.get('Referer');
  res.redirect(ref && ref.includes('/admin') ? ref : fallback);
};

router.get('/', (req, res) => {
  const revenue = db.all('SELECT source, SUM(amount) AS total, COUNT(*) AS n FROM revenue GROUP BY source');
  const revenue30 = db.get("SELECT COALESCE(SUM(amount), 0) AS t FROM revenue WHERE created_at >= datetime('now', '-30 days')").t;
  const totalRevenue = revenue.reduce((s, r) => s + r.total, 0);
  const daily = db.all(
    "SELECT date(created_at) AS day, SUM(amount) AS total FROM revenue WHERE created_at >= datetime('now', '-14 days') GROUP BY day ORDER BY day"
  );
  const stats = {
    users: db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'user'").c,
    premium: db.get("SELECT COUNT(*) AS c FROM users WHERE premium_until > datetime('now')").c,
    docs: db.get("SELECT COUNT(*) AS c FROM documents WHERE status = 'approved'").c,
    flagged: db.get("SELECT COUNT(*) AS c FROM documents WHERE status IN ('flagged', 'pending')").c,
    reports: db.get("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'").c,
    overdue: db.get("SELECT COUNT(*) AS c FROM reports WHERE status = 'open' AND deadline < datetime('now')").c,
    orders: db.get("SELECT COUNT(*) AS c FROM orders WHERE status = 'completed'").c,
    purchases: db.get('SELECT COUNT(*) AS c FROM purchases').c,
    gmv: db.get('SELECT COALESCE(SUM(price), 0) AS t FROM purchases').t + db.get("SELECT COALESCE(SUM(price), 0) AS t FROM orders WHERE status = 'completed'").t,
  };
  const recent = db.all('SELECT * FROM revenue ORDER BY id DESC LIMIT 10');
  res.render('admin/dashboard', { title: 'Quản trị', revenue, revenue30, totalRevenue, daily, stats, recent });
});

// ---------- Kiểm duyệt ----------
router.get('/moderation', (req, res) => {
  const docs = db.all(`${DOC_SELECT} WHERE d.status IN ('flagged', 'pending') ORDER BY d.created_at`);
  res.render('admin/moderation', { title: 'Hàng đợi kiểm duyệt', docs });
});

router.get('/documents', (req, res) => {
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').trim();
  const where = ['1 = 1'];
  const params = [];
  if (config.DOC_STATUS[status]) {
    where.push('d.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(d.title LIKE ? OR u.email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const docs = db.all(`${DOC_SELECT} WHERE ${where.join(' AND ')} ORDER BY d.id DESC LIMIT 200`, params);
  res.render('admin/documents', { title: 'Tất cả tài liệu', docs, f: { status, q } });
});

router.post('/documents/:id/approve', (req, res) => {
  const doc = db.get('SELECT * FROM documents WHERE id = ?', [toInt(req.params.id)]);
  if (doc) {
    db.tx(() => {
      db.run("UPDATE documents SET status = 'approved', moderation_notes = COALESCE(moderation_notes, '') || ' | Admin đã duyệt thủ công.', points_awarded = 1 WHERE id = ?", [doc.id]);
      if (!doc.points_awarded) db.run('UPDATE users SET points = points + ? WHERE id = ?', [config.POINTS.approvedUpload, doc.user_id]);
      wallet.notify(doc.user_id, `Tài liệu "${doc.title}" đã được duyệt và hiển thị công khai.`, '/documents/' + doc.id);
    });
    flash(req, 'success', `Đã duyệt tài liệu #${doc.id}.`);
  }
  back(req, res, '/admin/moderation');
});

router.post('/documents/:id/reject', (req, res) => {
  const doc = db.get('SELECT * FROM documents WHERE id = ?', [toInt(req.params.id)]);
  if (doc) {
    const note = String(req.body.note || 'Không đáp ứng chính sách nội dung.').trim();
    db.tx(() => {
      db.run("UPDATE documents SET status = 'rejected', moderation_notes = COALESCE(moderation_notes, '') || ? WHERE id = ?", [' | Admin từ chối: ' + note, doc.id]);
      wallet.notify(doc.user_id, `Tài liệu "${doc.title}" bị từ chối: ${note}`, '/my/documents');
    });
    flash(req, 'success', `Đã từ chối tài liệu #${doc.id}.`);
  }
  back(req, res, '/admin/moderation');
});

// ---------- Khiếu nại bản quyền (Notice & Takedown) ----------
router.get('/reports', (req, res) => {
  const reports = db.all(
    `SELECT r.*, d.title AS doc_title, d.status AS doc_status, d.user_id AS uploader_id, u.name AS uploader_name, u.strikes,
       (julianday(r.deadline) - julianday('now')) * 24 AS hours_left
     FROM reports r JOIN documents d ON d.id = r.document_id JOIN users u ON u.id = d.user_id
     ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.deadline`
  );
  res.render('admin/reports', { title: 'Khiếu nại bản quyền', reports });
});

router.post('/reports/:id/takedown', (req, res) => {
  const r = db.get('SELECT r.*, d.user_id AS uploader_id, d.title, d.file_hash FROM reports r JOIN documents d ON d.id = r.document_id WHERE r.id = ?', [toInt(req.params.id)]);
  if (!r || r.status !== 'open') return back(req, res, '/admin/reports');
  let banned = false;
  db.tx(() => {
    db.run("UPDATE documents SET status = 'taken_down' WHERE id = ?", [r.document_id]);
    db.run("UPDATE reports SET status = 'resolved_removed', resolved_at = datetime('now'), admin_note = ? WHERE id = ?", [String(req.body.note || '').trim(), r.id]);
    // các khiếu nại khác cho cùng tài liệu cũng được đóng
    db.run("UPDATE reports SET status = 'resolved_removed', resolved_at = datetime('now'), admin_note = 'Đã gỡ theo khiếu nại khác' WHERE document_id = ? AND status = 'open'", [r.document_id]);
    db.run('UPDATE users SET strikes = strikes + 1 WHERE id = ?', [r.uploader_id]);
    const u = db.get('SELECT strikes FROM users WHERE id = ?', [r.uploader_id]);
    if (u.strikes >= config.STRIKE_BAN) {
      db.run('UPDATE users SET banned = 1 WHERE id = ?', [r.uploader_id]);
      banned = true;
    }
    if (req.body.blacklist_hash && r.file_hash) {
      db.run("INSERT OR IGNORE INTO blacklist (type, value, note) VALUES ('hash', ?, ?)", [r.file_hash, 'Takedown khiếu nại #' + r.id]);
    }
    wallet.notify(
      r.uploader_id,
      `Tài liệu "${r.title}" đã bị gỡ do khiếu nại bản quyền #${r.id}. Cảnh cáo ${u.strikes}/${config.STRIKE_BAN}.` + (banned ? ' Tài khoản đã bị khoá.' : ''),
      '/my/documents'
    );
  });
  flash(req, 'success', `Đã gỡ tài liệu theo khiếu nại #${r.id}.` + (banned ? ' Người đăng đã bị khoá tài khoản (đủ 3 cảnh cáo).' : ''));
  back(req, res, '/admin/reports');
});

router.post('/reports/:id/reject', (req, res) => {
  db.run("UPDATE reports SET status = 'rejected', resolved_at = datetime('now'), admin_note = ? WHERE id = ? AND status = 'open'", [
    String(req.body.note || 'Khiếu nại không đủ căn cứ').trim(), toInt(req.params.id),
  ]);
  flash(req, 'success', 'Đã bác bỏ khiếu nại.');
  back(req, res, '/admin/reports');
});

// ---------- Người dùng ----------
router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim();
  const users = db.all(
    `SELECT u.*, s.code AS school_code, (SELECT COUNT(*) FROM documents WHERE user_id = u.id AND status = 'approved') AS doc_count
     FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE (? = '' OR u.email LIKE ? OR u.name LIKE ?) ORDER BY u.id DESC LIMIT 200`,
    [q, `%${q}%`, `%${q}%`]
  );
  res.render('admin/users', { title: 'Người dùng', users, q });
});

router.post('/users/:id/ban', (req, res) => {
  const id = toInt(req.params.id);
  if (id === req.user.id) flash(req, 'error', 'Không thể tự khoá chính mình.');
  else {
    db.run('UPDATE users SET banned = CASE banned WHEN 1 THEN 0 ELSE 1 END WHERE id = ?', [id]);
    flash(req, 'success', 'Đã cập nhật trạng thái tài khoản.');
  }
  back(req, res, '/admin/users');
});

router.post('/users/:id/strikes/reset', (req, res) => {
  db.run('UPDATE users SET strikes = 0 WHERE id = ?', [toInt(req.params.id)]);
  flash(req, 'success', 'Đã xoá cảnh cáo.');
  back(req, res, '/admin/users');
});

router.post('/users/:id/role', (req, res) => {
  const id = toInt(req.params.id);
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  if (id === req.user.id) flash(req, 'error', 'Không thể tự đổi vai trò.');
  else {
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    flash(req, 'success', 'Đã đổi vai trò.');
  }
  back(req, res, '/admin/users');
});

// ---------- Quảng cáo ----------
router.get('/ads', (req, res) => {
  res.render('admin/ads', { title: 'Quảng cáo', ads: db.all('SELECT * FROM ads ORDER BY id DESC') });
});

router.post('/ads', (req, res) => {
  const b = req.body;
  const budget = Math.max(0, toInt(b.budget));
  if (!b.advertiser || !b.title || safeUrl(b.link_url) === '#') {
    flash(req, 'error', 'Vui lòng nhập nhà quảng cáo, tiêu đề và link (http/https).');
    return res.redirect('/admin/ads');
  }
  db.tx(() => {
    const id = db.run('INSERT INTO ads (advertiser, category, title, body, image_url, link_url, placement, budget) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      b.advertiser.trim(), b.category, b.title.trim(), String(b.body || '').trim(), safeUrl(b.image_url) === '#' ? null : b.image_url,
      b.link_url.trim(), b.placement === 'home' ? 'home' : 'sidebar', budget,
    ]).lastInsertRowid;
    wallet.addRevenue('ads', budget, 'ad#' + id);
  });
  flash(req, 'success', 'Đã tạo quảng cáo.');
  res.redirect('/admin/ads');
});

router.post('/ads/:id/toggle', (req, res) => {
  db.run('UPDATE ads SET active = 1 - active WHERE id = ?', [toInt(req.params.id)]);
  res.redirect('/admin/ads');
});

router.post('/ads/:id/delete', (req, res) => {
  db.run('DELETE FROM ads WHERE id = ?', [toInt(req.params.id)]);
  flash(req, 'success', 'Đã xoá quảng cáo.');
  res.redirect('/admin/ads');
});

// ---------- Blacklist ----------
router.get('/blacklist', (req, res) => {
  res.render('admin/blacklist', { title: 'Blacklist bản quyền', items: db.all('SELECT * FROM blacklist ORDER BY type, id DESC') });
});

router.post('/blacklist', (req, res) => {
  const type = req.body.type === 'hash' ? 'hash' : 'keyword';
  const value = String(req.body.value || '').trim();
  if (!value) flash(req, 'error', 'Giá trị không được trống.');
  else {
    db.run('INSERT OR IGNORE INTO blacklist (type, value, note) VALUES (?, ?, ?)', [type, type === 'hash' ? value.toLowerCase() : value, String(req.body.note || '').trim()]);
    flash(req, 'success', 'Đã thêm vào blacklist.');
  }
  res.redirect('/admin/blacklist');
});

router.post('/blacklist/:id/delete', (req, res) => {
  db.run('DELETE FROM blacklist WHERE id = ?', [toInt(req.params.id)]);
  res.redirect('/admin/blacklist');
});

// ---------- Trường & môn học ----------
router.get('/schools', (req, res) => {
  const schools = db.all('SELECT * FROM schools ORDER BY name');
  const courses = db.all('SELECT c.*, s.code AS school_code FROM courses c JOIN schools s ON s.id = c.school_id ORDER BY s.code, c.code');
  res.render('admin/schools', { title: 'Trường & môn học', schools, courses });
});

router.post('/schools', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  if (!code || !name) flash(req, 'error', 'Nhập mã và tên trường.');
  else if (db.get('SELECT id FROM schools WHERE code = ?', [code])) flash(req, 'error', 'Mã trường đã tồn tại.');
  else {
    db.run('INSERT INTO schools (code, name) VALUES (?, ?)', [code, name]);
    flash(req, 'success', 'Đã thêm trường.');
  }
  res.redirect('/admin/schools');
});

router.post('/courses', (req, res) => {
  const schoolId = toInt(req.body.school_id);
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  if (!schoolId || !code || !name) flash(req, 'error', 'Nhập đủ trường, mã môn và tên môn.');
  else {
    db.run('INSERT OR IGNORE INTO courses (school_id, code, name) VALUES (?, ?, ?)', [schoolId, code, name]);
    flash(req, 'success', 'Đã thêm môn học.');
  }
  res.redirect('/admin/schools');
});

module.exports = router;
