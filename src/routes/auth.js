const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { flash } = require('../middleware/auth');
const { toInt } = require('../utils');

const router = express.Router();

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/register', { title: 'Đăng ký', schools: db.all('SELECT * FROM schools ORDER BY name'), values: {}, error: null });
});

router.post('/register', async (req, res, next) => {
  try {
    const { email = '', password = '', name = '', major = '' } = req.body;
    const schoolId = toInt(req.body.school_id) || null;
    const values = req.body;
    const schools = db.all('SELECT * FROM schools ORDER BY name');
    const em = email.trim().toLowerCase();
    let error = null;
    if (!/^\S+@\S+\.\S+$/.test(em)) error = 'Email không hợp lệ.';
    else if (password.length < 6) error = 'Mật khẩu tối thiểu 6 ký tự.';
    else if (password !== req.body.password2) error = 'Mật khẩu nhập lại không khớp.';
    else if (name.trim().length < 2) error = 'Vui lòng nhập họ tên.';
    else if (!req.body.agree) error = 'Bạn cần đồng ý Điều khoản sử dụng.';
    else if (db.get('SELECT id FROM users WHERE email = ?', [em])) error = 'Email đã được sử dụng.';
    if (error) return res.status(400).render('auth/register', { title: 'Đăng ký', schools, values, error });

    const hash = await bcrypt.hash(password, 10);
    const id = db.run(
      'INSERT INTO users (email, password_hash, name, school_id, major, points) VALUES (?, ?, ?, ?, ?, ?)',
      [em, hash, name.trim(), schoolId, major.trim(), config.POINTS.signup]
    ).lastInsertRowid;
    req.session.userId = id;
    flash(req, 'success', `Chào mừng ${name.trim()}! Bạn được tặng ${config.POINTS.signup} điểm để mở khoá tài liệu.`);
    res.redirect('/');
  } catch (e) {
    next(e);
  }
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/login', { title: 'Đăng nhập', values: {}, error: null });
});

router.post('/login', async (req, res, next) => {
  try {
    const em = String(req.body.email || '').trim().toLowerCase();
    const user = db.get('SELECT * FROM users WHERE email = ?', [em]);
    const ok = user && (await bcrypt.compare(String(req.body.password || ''), user.password_hash));
    if (!ok) return res.status(401).render('auth/login', { title: 'Đăng nhập', values: req.body, error: 'Email hoặc mật khẩu không đúng.' });
    if (user.banned) return res.status(403).render('auth/login', { title: 'Đăng nhập', values: req.body, error: 'Tài khoản đã bị khoá do vi phạm bản quyền nhiều lần.' });
    const returnTo = req.session.returnTo || '/';
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      flash(req, 'success', `Xin chào, ${user.name}!`);
      res.redirect(returnTo.startsWith('/') ? returnTo : '/');
    });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
