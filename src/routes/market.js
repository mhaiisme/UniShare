const fs = require('fs');
const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireLogin, flash } = require('../middleware/auth');
const { listingImage } = require('../middleware/upload');
const wallet = require('../services/wallet');
const { toInt } = require('../utils');

const router = express.Router();

const LISTING_SELECT = `SELECT l.*, u.name AS seller_name, s.code AS school_code, s.name AS school_name
  FROM listings l JOIN users u ON u.id = l.seller_id LEFT JOIN schools s ON s.id = l.school_id`;

function marketFee(price) {
  if (price <= 0) return 0;
  return Math.min(price, Math.max(config.MARKET_FEE_MIN, Math.round(price * config.MARKET_FEE_RATE)));
}

router.get('/market', (req, res) => {
  const q = String(req.query.q || '').trim();
  const school = toInt(req.query.school);
  const course = String(req.query.course || '').trim();
  const condition = String(req.query.condition || '');
  const sort = String(req.query.sort || 'newest');
  const where = ["l.status = 'available'"];
  const params = [];
  if (q) {
    where.push('(l.title LIKE ? OR l.author LIKE ? OR l.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (school) {
    where.push('l.school_id = ?');
    params.push(school);
  }
  if (course) {
    where.push('l.course_code LIKE ?');
    params.push(`%${course}%`);
  }
  if (config.CONDITIONS[condition]) {
    where.push('l.condition = ?');
    params.push(condition);
  }
  if (req.query.free) where.push('l.price = 0');
  const order = { newest: 'l.created_at DESC, l.id DESC', price_asc: 'l.price ASC', price_desc: 'l.price DESC' }[sort] || 'l.created_at DESC';
  const listings = db.all(`${LISTING_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 60`, params);
  res.render('market/index', {
    title: 'Chợ giáo trình cũ', listings, schools: db.all('SELECT * FROM schools ORDER BY name'),
    f: { q, school, course, condition, sort, free: req.query.free },
  });
});

router.get('/market/new', requireLogin, (req, res) => {
  res.render('market/new', { title: 'Đăng bán giáo trình', schools: db.all('SELECT * FROM schools ORDER BY name'), values: { school_id: req.user.school_id }, error: null });
});

router.post('/market', requireLogin, listingImage, (req, res) => {
  const b = req.body;
  const fail = (error) => {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(400).render('market/new', { title: 'Đăng bán giáo trình', schools: db.all('SELECT * FROM schools ORDER BY name'), values: b, error });
  };
  if (req.uploadError) return fail(req.uploadError);
  const title = String(b.title || '').trim();
  const price = toInt(b.price, -1);
  if (title.length < 3) return fail('Vui lòng nhập tên sách/giáo trình.');
  if (price < 0 || price > 10000000) return fail('Giá không hợp lệ (0 = tặng miễn phí).');
  if (!config.CONDITIONS[b.condition]) return fail('Vui lòng chọn tình trạng sách.');
  const id = db.run(
    `INSERT INTO listings (seller_id, school_id, title, author, course_code, condition, price, exchange_ok, location, description, image_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id, toInt(b.school_id) || null, title, String(b.author || '').trim(), String(b.course_code || '').trim().toUpperCase(),
      b.condition, price, b.exchange_ok ? 1 : 0, String(b.location || '').trim(), String(b.description || '').trim(),
      req.file ? req.file.filename : null,
    ]
  ).lastInsertRowid;
  flash(req, 'success', 'Đăng tin thành công!');
  res.redirect('/market/' + id);
});

router.get('/market/:id', (req, res, next) => {
  const listing = db.get(`${LISTING_SELECT} WHERE l.id = ?`, [toInt(req.params.id)]);
  if (!listing || (listing.status === 'hidden' && (!req.user || req.user.id !== listing.seller_id))) return next();
  const more = db.all(`${LISTING_SELECT} WHERE l.status = 'available' AND l.id != ? AND (l.seller_id = ? OR l.course_code = ?) LIMIT 4`, [
    listing.id, listing.seller_id, listing.course_code,
  ]);
  res.render('market/show', { title: listing.title, listing, more, fee: marketFee(listing.price) });
});

router.post('/market/:id/order', requireLogin, (req, res, next) => {
  const listing = db.get('SELECT * FROM listings WHERE id = ?', [toInt(req.params.id)]);
  if (!listing) return next();
  if (listing.seller_id === req.user.id) {
    flash(req, 'error', 'Bạn không thể mua tin của chính mình.');
    return res.redirect('/market/' + listing.id);
  }
  if (listing.status !== 'available') {
    flash(req, 'error', 'Sách này đang có người giao dịch hoặc đã bán.');
    return res.redirect('/market/' + listing.id);
  }
  try {
    const orderId = db.tx(() => {
      if (listing.price > 0) wallet.debit(req.user.id, listing.price, 'escrow_hold', `Ký quỹ mua "${listing.title}"`);
      const id = db.run('INSERT INTO orders (listing_id, buyer_id, seller_id, price, note) VALUES (?, ?, ?, ?, ?)', [
        listing.id, req.user.id, listing.seller_id, listing.price, String(req.body.note || '').trim().slice(0, 500),
      ]).lastInsertRowid;
      db.run("UPDATE listings SET status = 'reserved' WHERE id = ?", [listing.id]);
      wallet.notify(listing.seller_id, `${req.user.name} muốn mua "${listing.title}". Vui lòng xác nhận đơn #${id}.`, '/orders');
      return id;
    });
    flash(req, 'success', `Đã đặt mua (đơn #${orderId}). Tiền được giữ an toàn đến khi bạn xác nhận đã nhận sách.`);
    res.redirect('/orders');
  } catch (e) {
    if (e.code !== 'INSUFFICIENT_FUNDS') return next(e);
    flash(req, 'error', e.message + ' Vui lòng nạp thêm tiền.');
    res.redirect('/market/' + listing.id);
  }
});

router.post('/market/:id/toggle', requireLogin, (req, res, next) => {
  const listing = db.get('SELECT * FROM listings WHERE id = ? AND seller_id = ?', [toInt(req.params.id), req.user.id]);
  if (!listing) return next();
  if (!['available', 'hidden'].includes(listing.status)) {
    flash(req, 'error', 'Không thể ẩn tin đang giao dịch hoặc đã bán.');
  } else {
    db.run('UPDATE listings SET status = ? WHERE id = ?', [listing.status === 'available' ? 'hidden' : 'available', listing.id]);
    flash(req, 'success', listing.status === 'available' ? 'Đã ẩn tin.' : 'Đã hiển thị lại tin.');
  }
  res.redirect('/market/' + listing.id);
});

// ---------- Đơn hàng ----------
router.get('/orders', requireLogin, (req, res) => {
  const sel = `SELECT o.*, l.title, l.image_path, b.name AS buyer_name, b.email AS buyer_email, s.name AS seller_name, s.email AS seller_email
    FROM orders o JOIN listings l ON l.id = o.listing_id JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id`;
  const buying = db.all(`${sel} WHERE o.buyer_id = ? ORDER BY o.id DESC`, [req.user.id]);
  const selling = db.all(`${sel} WHERE o.seller_id = ? ORDER BY o.id DESC`, [req.user.id]);
  const myListings = db.all('SELECT * FROM listings WHERE seller_id = ? ORDER BY id DESC', [req.user.id]);
  res.render('market/orders', { title: 'Đơn hàng giáo trình', buying, selling, myListings, marketFee });
});

function loadOrder(req) {
  return db.get('SELECT o.*, l.title FROM orders o JOIN listings l ON l.id = o.listing_id WHERE o.id = ?', [toInt(req.params.id)]);
}

router.post('/orders/:id/confirm', requireLogin, (req, res, next) => {
  const o = loadOrder(req);
  if (!o || o.seller_id !== req.user.id) return next();
  if (o.status !== 'pending') {
    flash(req, 'error', 'Đơn hàng không ở trạng thái chờ xác nhận.');
  } else {
    db.tx(() => {
      db.run("UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?", [o.id]);
      wallet.notify(o.buyer_id, `Người bán đã xác nhận đơn #${o.id} "${o.title}". Hãy liên hệ để nhận sách.`, '/orders');
    });
    flash(req, 'success', 'Đã xác nhận đơn hàng. Hãy liên hệ người mua để giao sách.');
  }
  res.redirect('/orders');
});

router.post('/orders/:id/complete', requireLogin, (req, res, next) => {
  const o = loadOrder(req);
  if (!o || o.buyer_id !== req.user.id) return next();
  if (o.status !== 'confirmed') {
    flash(req, 'error', 'Chỉ có thể hoàn tất đơn đã được người bán xác nhận.');
    return res.redirect('/orders');
  }
  const fee = marketFee(o.price);
  db.tx(() => {
    if (o.price > 0) {
      wallet.credit(o.seller_id, o.price - fee, 'market_sale', `Bán "${o.title}" – đơn #${o.id} (phí ${fee.toLocaleString('vi-VN')}đ)`);
      wallet.addRevenue('txn_fee', fee, 'order#' + o.id);
    }
    db.run("UPDATE orders SET status = 'completed', fee = ?, updated_at = datetime('now') WHERE id = ?", [fee, o.id]);
    db.run("UPDATE listings SET status = 'sold' WHERE id = ?", [o.listing_id]);
    wallet.notify(o.seller_id, `Đơn #${o.id} hoàn tất. Bạn nhận ${(o.price - fee).toLocaleString('vi-VN')}đ.`, '/wallet');
  });
  flash(req, 'success', 'Cảm ơn bạn! Giao dịch đã hoàn tất.');
  res.redirect('/orders');
});

router.post('/orders/:id/cancel', requireLogin, (req, res, next) => {
  const o = loadOrder(req);
  if (!o || (o.buyer_id !== req.user.id && o.seller_id !== req.user.id)) return next();
  const isBuyer = o.buyer_id === req.user.id;
  const allowed = isBuyer ? o.status === 'pending' : ['pending', 'confirmed'].includes(o.status);
  if (!allowed) {
    flash(req, 'error', isBuyer ? 'Người mua chỉ huỷ được khi người bán chưa xác nhận.' : 'Không thể huỷ đơn này.');
    return res.redirect('/orders');
  }
  db.tx(() => {
    if (o.price > 0) wallet.credit(o.buyer_id, o.price, 'escrow_refund', `Hoàn tiền đơn #${o.id} "${o.title}"`);
    db.run("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", [o.id]);
    db.run("UPDATE listings SET status = 'available' WHERE id = ?", [o.listing_id]);
    wallet.notify(isBuyer ? o.seller_id : o.buyer_id, `Đơn #${o.id} "${o.title}" đã bị huỷ.`, '/orders');
  });
  flash(req, 'success', 'Đã huỷ đơn hàng' + (o.price > 0 ? ' và hoàn tiền cho người mua.' : '.'));
  res.redirect('/orders');
});

module.exports = router;
