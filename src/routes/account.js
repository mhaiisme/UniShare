const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { requireLogin, flash } = require('../middleware/auth');
const wallet = require('../services/wallet');
const { toInt, parseDate, isPremium, sqlNow } = require('../utils');

const router = express.Router();

// ---------- Ví ----------
router.get('/wallet', requireLogin, (req, res) => {
  const txns = db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.id]);
  res.render('account/wallet', { title: 'Ví của tôi', txns });
});

router.post('/wallet/topup', requireLogin, (req, res) => {
  const amount = toInt(req.body.amount);
  const methods = { vnpay: 'VNPay', momo: 'MoMo', bank: 'Chuyển khoản' };
  const method = methods[req.body.method] || 'VNPay';
  if (amount < 10000 || amount > 5000000) {
    flash(req, 'error', 'Số tiền nạp từ 10.000đ đến 5.000.000đ.');
    return res.redirect('/wallet');
  }
  // Mô phỏng cổng thanh toán: ghi nhận thành công ngay
  wallet.credit(req.user.id, amount, 'topup', `Nạp tiền qua ${method} (mô phỏng)`);
  flash(req, 'success', `Nạp thành công ${amount.toLocaleString('vi-VN')}đ qua ${method}.`);
  res.redirect(req.body.back && String(req.body.back).startsWith('/') ? req.body.back : '/wallet');
});

// ---------- Premium ----------
router.get('/premium', (req, res) => {
  res.render('account/premium', { title: 'Gói Premium' });
});

router.post('/premium/buy', requireLogin, (req, res, next) => {
  const planKey = String(req.body.plan || '');
  const plan = config.PREMIUM_PLANS[planKey];
  if (!plan) {
    flash(req, 'error', 'Gói không hợp lệ.');
    return res.redirect('/premium');
  }
  try {
    db.tx(() => {
      wallet.debit(req.user.id, plan.price, 'premium', `Mua ${plan.name}`);
      const base = isPremium(req.user) ? parseDate(req.user.premium_until).getTime() : Date.now();
      const until = sqlNow(base - Date.now() + plan.days * 24 * 3600 * 1000);
      db.run('UPDATE users SET premium_until = ? WHERE id = ?', [until, req.user.id]);
      wallet.addRevenue('premium', plan.price, 'user#' + req.user.id);
    });
    flash(req, 'success', `Kích hoạt ${plan.name} thành công! Tận hưởng xem không giới hạn, flashcard AI và quiz.`);
    res.redirect('/premium');
  } catch (e) {
    if (e.code !== 'INSUFFICIENT_FUNDS') return next(e);
    flash(req, 'error', e.message + ' Vui lòng nạp thêm tiền vào ví.');
    res.redirect('/wallet');
  }
});

// ---------- Hồ sơ ----------
router.get('/profile', requireLogin, (req, res) => {
  res.render('account/profile', { title: 'Hồ sơ', schools: db.all('SELECT * FROM schools ORDER BY name'), error: null });
});

router.post('/profile', requireLogin, async (req, res, next) => {
  try {
    const b = req.body;
    const schools = db.all('SELECT * FROM schools ORDER BY name');
    const name = String(b.name || '').trim();
    if (name.length < 2) return res.status(400).render('account/profile', { title: 'Hồ sơ', schools, error: 'Họ tên không hợp lệ.' });
    if (b.new_password) {
      if (!(await bcrypt.compare(String(b.current_password || ''), req.user.password_hash)))
        return res.status(400).render('account/profile', { title: 'Hồ sơ', schools, error: 'Mật khẩu hiện tại không đúng.' });
      if (String(b.new_password).length < 6)
        return res.status(400).render('account/profile', { title: 'Hồ sơ', schools, error: 'Mật khẩu mới tối thiểu 6 ký tự.' });
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(b.new_password), 10), req.user.id]);
    }
    db.run('UPDATE users SET name = ?, school_id = ?, major = ?, bio = ? WHERE id = ?', [
      name, toInt(b.school_id) || null, String(b.major || '').trim(), String(b.bio || '').trim().slice(0, 500), req.user.id,
    ]);
    flash(req, 'success', 'Đã cập nhật hồ sơ.');
    res.redirect('/profile');
  } catch (e) {
    next(e);
  }
});

// ---------- Thông báo ----------
router.get('/notifications', requireLogin, (req, res) => {
  const items = db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.id]);
  db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.locals.unread = 0;
  res.render('account/notifications', { title: 'Thông báo', items });
});

module.exports = router;
