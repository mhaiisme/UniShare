const db = require('../db');
const config = require('../config');
const utils = require('../utils');

function loadUser(req, res, next) {
  req.user = null;
  if (req.session.userId) {
    const u = db.get('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!u || u.banned) {
      delete req.session.userId;
      if (u && u.banned) req.session.flash = { type: 'error', msg: 'Tài khoản của bạn đã bị khoá do vi phạm chính sách.' };
    } else {
      req.user = u;
    }
  }
  const user = req.user;
  res.locals.currentUser = user;
  res.locals.premium = utils.isPremium(user);
  res.locals.unread = user
    ? db.get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [user.id]).c
    : 0;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.config = config;
  res.locals.u = utils;
  res.locals.path = req.path;
  res.locals.query = req.query;

  // Quảng cáo (ẩn với Premium)
  res.locals.ads = { sidebar: [], home: [] };
  if (!res.locals.premium && req.method === 'GET' && !req.path.startsWith('/admin')) {
    const ads = db.all('SELECT * FROM ads WHERE active = 1 ORDER BY RANDOM() LIMIT 6');
    for (const ad of ads) (res.locals.ads[ad.placement] || (res.locals.ads[ad.placement] = [])).push(ad);
    res.locals.ads.sidebar = res.locals.ads.sidebar.slice(0, 2);
    res.locals.ads.home = res.locals.ads.home.slice(0, 3);
    const shown = [...res.locals.ads.sidebar, ...res.locals.ads.home].map((a) => a.id);
    if (shown.length) db.run(`UPDATE ads SET impressions = impressions + 1 WHERE id IN (${shown.map(() => '?').join(',')})`, shown);
  }
  next();
}

function flash(req, type, msg) {
  req.session.flash = { type, msg };
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  flash(req, 'info', 'Vui lòng đăng nhập để tiếp tục.');
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).render('error', { title: 'Không có quyền', message: 'Trang này chỉ dành cho quản trị viên.', status: 403 });
}

module.exports = { loadUser, requireLogin, requireAdmin, flash };
