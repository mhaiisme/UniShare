const express = require('express');
const db = require('../db');
const config = require('../config');
const { flash } = require('../middleware/auth');
const { notifyAdmins } = require('../services/wallet');
const { toInt, safeUrl } = require('../utils');

const router = express.Router();

const DOC_SELECT = `SELECT d.*, u.name AS author_name, s.code AS school_code, s.name AS school_name, c.code AS course_code, c.name AS course_name
  FROM documents d JOIN users u ON u.id = d.user_id
  LEFT JOIN schools s ON s.id = d.school_id LEFT JOIN courses c ON c.id = d.course_id`;

router.get('/', (req, res) => {
  const latest = db.all(`${DOC_SELECT} WHERE d.status = 'approved' ORDER BY d.created_at DESC, d.id DESC LIMIT 8`);
  const topRated = db.all(`${DOC_SELECT} WHERE d.status = 'approved' AND d.rating_count >= 2 ORDER BY d.rating_avg DESC, d.rating_count DESC, d.views DESC LIMIT 6`);
  const listings = db.all(`SELECT l.*, s.code AS school_code FROM listings l LEFT JOIN schools s ON s.id = l.school_id
    WHERE l.status = 'available' ORDER BY l.created_at DESC, l.id DESC LIMIT 6`);
  const posts = db.all(`SELECT p.*, u.name AS author_name, s.code AS school_code, (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN schools s ON s.id = p.school_id ORDER BY p.created_at DESC, p.id DESC LIMIT 6`);
  const stats = {
    docs: db.get("SELECT COUNT(*) AS c FROM documents WHERE status = 'approved'").c,
    users: db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'user'").c,
    listings: db.get("SELECT COUNT(*) AS c FROM listings WHERE status = 'available'").c,
    schools: db.get('SELECT COUNT(*) AS c FROM schools').c,
    courses: db.get('SELECT COUNT(*) AS c FROM courses').c,
    reviews: db.get('SELECT COUNT(*) AS c FROM reviews').c,
  };
  const schools = db.all(`
    SELECT s.*,
      (SELECT COUNT(*) FROM documents d WHERE d.school_id = s.id AND d.status = 'approved') AS doc_count,
      (SELECT COUNT(*) FROM courses c WHERE c.school_id = s.id) AS course_count
    FROM schools s ORDER BY doc_count DESC, s.code
  `);
  const popularCourses = db.all(`
    SELECT c.id, c.code, c.name, s.id AS school_id, s.code AS school_code,
      COUNT(d.id) AS doc_count
    FROM courses c
    JOIN schools s ON s.id = c.school_id
    LEFT JOIN documents d ON d.course_id = c.id AND d.status = 'approved'
    GROUP BY c.id
    ORDER BY doc_count DESC, c.code
    LIMIT 12
  `);
  res.render('home', { title: 'Kho tài liệu & giáo trình đại học', latest, topRated, listings, posts, stats, schools, popularCourses });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const school = toInt(req.query.school);
  const course = String(req.query.course || '').trim();
  const type = String(req.query.type || '');
  const price = String(req.query.price || '');
  const sort = String(req.query.sort || 'newest');
  const page = Math.max(1, toInt(req.query.page, 1));
  const perPage = 12;

  const where = ["d.status = 'approved'"];
  const params = [];
  if (q) {
    where.push('(d.title LIKE ? OR d.description LIKE ? OR c.code LIKE ? OR c.name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (school) {
    where.push('d.school_id = ?');
    params.push(school);
  }
  if (course) {
    where.push('(c.code LIKE ? OR c.name LIKE ?)');
    params.push(`%${course}%`, `%${course}%`);
  }
  if (type && config.DOC_TYPES[type]) {
    where.push('d.doc_type = ?');
    params.push(type);
  }
  if (price === 'free') where.push('d.price = 0');
  if (price === 'paid') where.push('d.price > 0');
  const orderBy = {
    newest: 'd.created_at DESC, d.id DESC',
    rating: 'd.rating_avg DESC, d.rating_count DESC',
    popular: 'd.views DESC',
    price_asc: 'd.price ASC',
  }[sort] || 'd.created_at DESC, d.id DESC';

  const whereSql = where.join(' AND ');
  const total = db.get(
    `SELECT COUNT(*) AS c FROM documents d LEFT JOIN courses c ON c.id = d.course_id WHERE ${whereSql}`,
    params
  ).c;
  const docs = db.all(`${DOC_SELECT} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, perPage, (page - 1) * perPage]);
  const schools = db.all('SELECT * FROM schools ORDER BY name');
  res.render('search', { title: 'Tìm tài liệu', docs, schools, total, page, pages: Math.max(1, Math.ceil(total / perPage)), f: { q, school, course, type, price, sort } });
});

router.get('/api/courses', (req, res) => {
  res.json(db.all('SELECT id, code, name FROM courses WHERE school_id = ? ORDER BY code', [toInt(req.query.school_id)]));
});

router.get('/terms', (req, res) => res.render('terms', { title: 'Điều khoản & Chính sách bản quyền' }));

router.get('/dmca', (req, res) => {
  const doc = req.query.doc ? db.get('SELECT id, title FROM documents WHERE id = ?', [toInt(req.query.doc)]) : null;
  res.render('dmca', { title: 'Báo cáo vi phạm bản quyền', doc, values: {}, error: null });
});

router.post('/dmca', (req, res) => {
  const b = req.body;
  const docId = toInt(String(b.document_id || '').replace(/\D/g, ''));
  const doc = docId ? db.get('SELECT id, title FROM documents WHERE id = ?', [docId]) : null;
  let error = null;
  if (!doc) error = 'Mã tài liệu không tồn tại.';
  else if (!b.reporter_name || !b.reporter_email || !/^\S+@\S+\.\S+$/.test(b.reporter_email)) error = 'Vui lòng nhập họ tên và email hợp lệ.';
  else if (!b.reason || b.reason.trim().length < 20) error = 'Vui lòng mô tả vi phạm (tối thiểu 20 ký tự).';
  else if (!b.good_faith) error = 'Bạn cần xác nhận cam kết trung thực.';
  if (error) return res.status(400).render('dmca', { title: 'Báo cáo vi phạm bản quyền', doc, values: b, error });

  const deadline = new Date(Date.now() + config.TAKEDOWN_HOURS * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const id = db.run(
    `INSERT INTO reports (document_id, reporter_name, reporter_email, reporter_role, original_work, reason, evidence_url, deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [doc.id, b.reporter_name.trim(), b.reporter_email.trim(), b.reporter_role, b.original_work, b.reason.trim(), b.evidence_url, deadline]
  ).lastInsertRowid;
  notifyAdmins(`Khiếu nại bản quyền #${id} cho tài liệu "${doc.title}" – hạn xử lý ${config.TAKEDOWN_HOURS}h.`, '/admin/reports');
  flash(req, 'success', `Đã tiếp nhận khiếu nại #${id}. Chúng tôi sẽ xử lý trong vòng ${config.TAKEDOWN_HOURS} giờ và phản hồi qua email.`);
  res.redirect('/documents/' + doc.id);
});

router.get('/ads/:id/click', (req, res) => {
  const ad = db.get('SELECT * FROM ads WHERE id = ?', [toInt(req.params.id)]);
  if (!ad) return res.redirect('/');
  db.run('UPDATE ads SET clicks = clicks + 1 WHERE id = ?', [ad.id]);
  const url = safeUrl(ad.link_url);
  res.redirect(url === '#' ? '/' : url);
});

router.get('/u/:id', (req, res, next) => {
  const profile = db.get(
    'SELECT u.id, u.name, u.major, u.bio, u.created_at, s.name AS school_name FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE u.id = ? AND u.banned = 0',
    [toInt(req.params.id)]
  );
  if (!profile) return next();
  const docs = db.all(`${DOC_SELECT} WHERE d.user_id = ? AND d.status = 'approved' ORDER BY d.created_at DESC`, [profile.id]);
  const listings = db.all("SELECT * FROM listings WHERE seller_id = ? AND status = 'available' ORDER BY created_at DESC", [profile.id]);
  res.render('profile-public', { title: profile.name, profile, docs, listings });
});

router.DOC_SELECT = DOC_SELECT;
module.exports = router;
