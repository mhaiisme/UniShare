const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireLogin, flash } = require('../middleware/auth');
const { toInt } = require('../utils');

const router = express.Router();

router.get('/forum', (req, res) => {
  const cat = String(req.query.category || '');
  const q = String(req.query.q || '').trim();
  const course = String(req.query.course || '').trim();
  const where = ['1 = 1'];
  const params = [];
  if (config.POST_CATEGORIES[cat]) {
    where.push('p.category = ?');
    params.push(cat);
  }
  if (q) {
    where.push('(p.title LIKE ? OR p.body LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (course) {
    where.push('p.course_code LIKE ?');
    params.push(`%${course}%`);
  }
  const posts = db.all(
    `SELECT p.*, u.name AS author_name, s.code AS school_code, (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
     FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN schools s ON s.id = p.school_id
     WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC, p.id DESC LIMIT 50`,
    params
  );
  res.render('forum/index', { title: 'Diễn đàn', posts, f: { category: cat, q, course } });
});

router.get('/forum/new', requireLogin, (req, res) => {
  res.render('forum/new', { title: 'Viết bài', schools: db.all('SELECT * FROM schools ORDER BY name'), values: { school_id: req.user.school_id, category: req.query.category }, error: null });
});

router.post('/forum', requireLogin, (req, res) => {
  const b = req.body;
  const title = String(b.title || '').trim();
  const body = String(b.body || '').trim();
  let error = null;
  if (title.length < 5) error = 'Tiêu đề tối thiểu 5 ký tự.';
  else if (body.length < 10) error = 'Nội dung tối thiểu 10 ký tự.';
  else if (!config.POST_CATEGORIES[b.category]) error = 'Vui lòng chọn chuyên mục.';
  if (error) return res.status(400).render('forum/new', { title: 'Viết bài', schools: db.all('SELECT * FROM schools ORDER BY name'), values: b, error });
  const id = db.run('INSERT INTO posts (user_id, school_id, course_code, category, title, body) VALUES (?, ?, ?, ?, ?, ?)', [
    req.user.id, toInt(b.school_id) || null, String(b.course_code || '').trim().toUpperCase(), b.category, title, body,
  ]).lastInsertRowid;
  flash(req, 'success', 'Đã đăng bài viết.');
  res.redirect('/forum/' + id);
});

router.get('/forum/:id', (req, res, next) => {
  const post = db.get(
    `SELECT p.*, u.name AS author_name, s.name AS school_name FROM posts p JOIN users u ON u.id = p.user_id
     LEFT JOIN schools s ON s.id = p.school_id WHERE p.id = ?`,
    [toInt(req.params.id)]
  );
  if (!post) return next();
  const comments = db.all(
    'SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at, c.id',
    [post.id]
  );
  res.render('forum/show', { title: post.title, post, comments });
});

router.post('/forum/:id/comments', requireLogin, (req, res, next) => {
  const post = db.get('SELECT id, user_id, title FROM posts WHERE id = ?', [toInt(req.params.id)]);
  if (!post) return next();
  const body = String(req.body.body || '').trim();
  if (body.length < 2) {
    flash(req, 'error', 'Bình luận quá ngắn.');
  } else {
    db.run('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)', [post.id, req.user.id, body.slice(0, 3000)]);
    if (post.user_id !== req.user.id) {
      require('../services/wallet').notify(post.user_id, `${req.user.name} đã bình luận bài "${post.title}".`, '/forum/' + post.id);
    }
  }
  res.redirect('/forum/' + post.id + '#comments');
});

router.post('/forum/:id/delete', requireLogin, (req, res, next) => {
  const post = db.get('SELECT * FROM posts WHERE id = ?', [toInt(req.params.id)]);
  if (!post || (post.user_id !== req.user.id && req.user.role !== 'admin')) return next();
  db.tx(() => {
    db.run('DELETE FROM comments WHERE post_id = ?', [post.id]);
    db.run('DELETE FROM posts WHERE id = ?', [post.id]);
  });
  flash(req, 'success', 'Đã xoá bài viết.');
  res.redirect('/forum');
});

module.exports = router;
