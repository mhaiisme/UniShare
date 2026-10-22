const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireLogin, flash } = require('../middleware/auth');
const { docFile, DOC_DIR } = require('../middleware/upload');
const { getAccess, canSee } = require('../services/access');
const { extractText, moderate } = require('../services/moderation');
const { watermarkPdf, pageCount } = require('../services/watermark');
const { generateCards } = require('../services/flashcardGen');
const wallet = require('../services/wallet');
const { toInt, sha256, isPremium, renderMarkdown, previewText } = require('../utils');
const { DOC_SELECT } = require('./pages');

const router = express.Router();

function loadDoc(id) {
  return db.get(`${DOC_SELECT} WHERE d.id = ?`, [toInt(id)]);
}

function findOrCreateCourse(schoolId, code, name) {
  code = String(code || '').trim().toUpperCase();
  if (!schoolId || !code) return null;
  const c = db.get('SELECT id FROM courses WHERE school_id = ? AND code = ?', [schoolId, code]);
  if (c) return c.id;
  return db.run('INSERT INTO courses (school_id, code, name) VALUES (?, ?, ?)', [schoolId, code, String(name || '').trim() || code]).lastInsertRowid;
}

function removeFile(file) {
  if (file && file.path) fs.unlink(file.path, () => {});
}

function viewerLabel(user) {
  return `${user.email} | ID ${user.id}`;
}

// ---------- Đăng tài liệu ----------
router.get('/documents/new', requireLogin, (req, res) => {
  res.render('documents/new', { title: 'Đăng tài liệu', schools: db.all('SELECT * FROM schools ORDER BY name'), values: { school_id: req.user.school_id }, error: null });
});

router.post('/documents', requireLogin, docFile, async (req, res, next) => {
  const b = req.body;
  const file = req.file;
  const schools = db.all('SELECT * FROM schools ORDER BY name');
  const fail = (error) => {
    removeFile(file);
    res.status(400).render('documents/new', { title: 'Đăng tài liệu', schools, values: b, error });
  };
  try {
    if (req.uploadError) return fail(req.uploadError);
    const title = String(b.title || '').trim();
    const content = String(b.content || '').trim();
    const price = toInt(b.price, 0);
    const schoolId = toInt(b.school_id) || null;
    if (title.length < 5) return fail('Tiêu đề tối thiểu 5 ký tự.');
    if (!config.DOC_TYPES[b.doc_type]) return fail('Vui lòng chọn loại tài liệu.');
    if (!schoolId || !String(b.course_code || '').trim()) return fail('Vui lòng chọn trường và nhập mã môn học.');
    if (!content && !file) return fail('Vui lòng soạn nội dung hoặc đính kèm file.');
    if (b.doc_type === 'course' && (!file || !config.VIDEO_EXT.includes(path.extname(file.originalname).toLowerCase())))
      return fail('Khoá học video cần đính kèm file MP4/WEBM.');
    if (price < 0 || (price > 0 && (price < config.DOC_MIN_PRICE || price > config.DOC_MAX_PRICE)))
      return fail(`Giá phải bằng 0 (miễn phí) hoặc từ ${config.DOC_MIN_PRICE.toLocaleString('vi-VN')}đ đến ${config.DOC_MAX_PRICE.toLocaleString('vi-VN')}đ.`);
    if (!b.agree_copyright) return fail('Bạn phải tích cam kết bản quyền trước khi đăng.');

    let fileHash = null;
    let fileText = '';
    if (file) {
      fileHash = sha256(fs.readFileSync(file.path));
      fileText = await extractText(file.path, file.originalname);
    }
    const result = moderate({ title, description: b.description, content, fileText, fileHash });
    const courseId = findOrCreateCourse(schoolId, b.course_code, b.course_name);

    const status = result.status;
    const id = db.tx(() => {
      const docId = db.run(
        `INSERT INTO documents (user_id, school_id, course_id, title, description, doc_type, content, extracted_text,
           file_path, file_name, file_mime, file_size, file_hash, price, allow_download, status, moderation_notes, similarity,
           points_awarded, copyright_agreed_at, agreement_ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
        [
          req.user.id, schoolId, courseId, title, String(b.description || '').trim(), b.doc_type, content, fileText,
          file && status !== 'rejected' ? path.basename(file.path) : null,
          file ? file.originalname : null, file ? file.mimetype : null, file ? file.size : null, fileHash,
          price, b.allow_download ? 1 : 0, status, result.notes.join(' '), result.similarity,
          status === 'approved' ? 1 : 0, req.ip,
        ]
      ).lastInsertRowid;
      if (status === 'approved') {
        db.run('UPDATE users SET points = points + ? WHERE id = ?', [config.POINTS.approvedUpload, req.user.id]);
      } else if (status === 'flagged') {
        wallet.notifyAdmins(`Tài liệu #${docId} bị gắn cờ kiểm duyệt: ${title}`, '/admin/moderation');
      }
      return docId;
    });

    if (status === 'rejected') {
      removeFile(file);
      flash(req, 'error', 'Tài liệu bị từ chối: ' + result.notes.join(' '));
      return res.redirect('/my/documents');
    }
    if (status === 'flagged') {
      flash(req, 'warning', 'Tài liệu đã được gửi nhưng bị gắn cờ, cần kiểm duyệt viên xem xét trước khi hiển thị. Lý do: ' + result.notes.join(' '));
    } else {
      flash(req, 'success', `Đăng tài liệu thành công! Bạn được cộng ${config.POINTS.approvedUpload} điểm.`);
    }
    res.redirect('/documents/' + id);
  } catch (e) {
    removeFile(file);
    next(e);
  }
});

// ---------- Xem tài liệu ----------
router.get('/documents/:id', (req, res, next) => {
  const doc = loadDoc(req.params.id);
  if (!canSee(req.user, doc)) return next();
  const access = getAccess(req.user, doc);
  if (!req.user || req.user.id !== doc.user_id) db.run('UPDATE documents SET views = views + 1 WHERE id = ?', [doc.id]);

  const ext = doc.file_name ? path.extname(doc.file_name).toLowerCase() : '';
  const fileKind = !doc.file_path ? null
    : ext === '.pdf' ? 'pdf'
    : config.VIDEO_EXT.includes(ext) ? 'video'
    : config.IMAGE_EXT.includes(ext) ? 'image'
    : config.TEXT_EXT.includes(ext) ? 'text' : 'other';

  const ratio = config.PREVIEW_RATIO;
  const contentHtml = doc.content ? renderMarkdown(access.full ? doc.content : previewText(doc.content, ratio)) : '';
  let textFile = '';
  if (fileKind === 'text' && doc.extracted_text) textFile = access.full ? doc.extracted_text : previewText(doc.extracted_text, ratio);

  const reviews = db.all(
    'SELECT r.*, u.name AS user_name FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.document_id = ? ORDER BY r.created_at DESC',
    [doc.id]
  );
  const myReview = req.user ? reviews.find((r) => r.user_id === req.user.id) : null;
  const related = db.all(
    `${DOC_SELECT} WHERE d.status = 'approved' AND d.id != ? AND (d.course_id = ? OR d.school_id = ?) ORDER BY d.rating_avg DESC LIMIT 4`,
    [doc.id, doc.course_id, doc.school_id]
  );
  const sales = req.user && (req.user.id === doc.user_id || req.user.role === 'admin')
    ? db.get('SELECT COUNT(*) AS c, COALESCE(SUM(price - commission), 0) AS earned FROM purchases WHERE document_id = ?', [doc.id])
    : null;
  res.render('documents/show', {
    title: doc.title, doc, access, contentHtml, textFile, fileKind, reviews, myReview, related, sales,
    watermark: req.user ? viewerLabel(req.user) : 'Khách – UniShare',
  });
});

// File PDF / ảnh hiển thị inline (đã đóng dấu chìm, preview 20% số trang)
router.get('/documents/:id/file', async (req, res, next) => {
  try {
    const doc = loadDoc(req.params.id);
    if (!canSee(req.user, doc) || !doc.file_path) return next();
    const access = getAccess(req.user, doc);
    const filePath = path.join(DOC_DIR, doc.file_path);
    if (!fs.existsSync(filePath)) return next();
    const ext = path.extname(doc.file_name).toLowerCase();
    if (ext === '.pdf') {
      const buf = fs.readFileSync(filePath);
      let opts = {};
      if (!access.full) {
        const total = await pageCount(buf);
        opts = { maxPages: Math.max(1, Math.ceil(total * config.PREVIEW_RATIO)), preview: true };
      }
      const out = await watermarkPdf(buf, req.user ? viewerLabel(req.user) : 'Khach xem truoc', opts);
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'no-store' });
      return res.send(out);
    }
    if (config.IMAGE_EXT.includes(ext) && access.full) {
      res.set('Cache-Control', 'no-store');
      return res.sendFile(filePath);
    }
    res.status(403).send('Không có quyền xem file này.');
  } catch (e) {
    console.error('[file]', e.message);
    res.status(415).send('Không thể hiển thị file này trên trình đọc web.');
  }
});

// Stream video khoá học (hỗ trợ Range qua sendFile)
router.get('/documents/:id/stream', (req, res, next) => {
  const doc = loadDoc(req.params.id);
  if (!canSee(req.user, doc) || !doc.file_path) return next();
  if (!getAccess(req.user, doc).full) return res.status(403).send('Bạn cần mua khoá học để xem.');
  const filePath = path.join(DOC_DIR, doc.file_path);
  if (!fs.existsSync(filePath)) return next();
  res.set({ 'Content-Disposition': 'inline', 'Cache-Control': 'no-store' });
  res.sendFile(filePath);
});

// Tải file gốc (PDF luôn có watermark người tải)
router.get('/documents/:id/download', requireLogin, async (req, res, next) => {
  try {
    const doc = loadDoc(req.params.id);
    if (!canSee(req.user, doc) || !doc.file_path) return next();
    const access = getAccess(req.user, doc);
    const isOwner = req.user.id === doc.user_id || req.user.role === 'admin';
    if (!access.full || (!doc.allow_download && !isOwner)) {
      flash(req, 'error', 'Tài liệu này chỉ xem trực tuyến hoặc bạn chưa có quyền tải.');
      return res.redirect('/documents/' + doc.id);
    }
    const filePath = path.join(DOC_DIR, doc.file_path);
    if (!fs.existsSync(filePath)) return next();
    db.run('UPDATE documents SET downloads = downloads + 1 WHERE id = ?', [doc.id]);
    const ext = path.extname(doc.file_name).toLowerCase();
    if (ext === '.pdf') {
      let out;
      try {
        out = await watermarkPdf(fs.readFileSync(filePath), viewerLabel(req.user));
      } catch (e) {
        flash(req, 'error', 'Không thể đóng dấu bản quyền cho file này, vui lòng xem trực tuyến.');
        return res.redirect('/documents/' + doc.id);
      }
      res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' });
      res.attachment(doc.file_name);
      return res.send(out);
    }
    res.download(filePath, doc.file_name);
  } catch (e) {
    next(e);
  }
});

// ---------- Mua / mở khoá ----------
router.post('/documents/:id/buy', requireLogin, (req, res, next) => {
  const doc = loadDoc(req.params.id);
  if (!doc || doc.status !== 'approved') return next();
  if (doc.price <= 0) return res.redirect('/documents/' + doc.id);
  if (getAccess(req.user, doc).full) {
    flash(req, 'info', 'Bạn đã có quyền truy cập tài liệu này.');
    return res.redirect('/documents/' + doc.id);
  }
  try {
    const commission = Math.round(doc.price * config.DOC_COMMISSION_RATE);
    db.tx(() => {
      wallet.debit(req.user.id, doc.price, 'doc_purchase', `Mua tài liệu #${doc.id}: ${doc.title}`);
      wallet.credit(doc.user_id, doc.price - commission, 'doc_sale', `Bán tài liệu #${doc.id} (đã trừ ${config.DOC_COMMISSION_RATE * 100}% phí nền tảng)`);
      wallet.addRevenue('commission', commission, 'doc#' + doc.id);
      db.run('INSERT INTO purchases (user_id, document_id, price, commission) VALUES (?, ?, ?, ?)', [req.user.id, doc.id, doc.price, commission]);
      wallet.notify(doc.user_id, `${req.user.name} đã mua tài liệu "${doc.title}". Bạn nhận ${(doc.price - commission).toLocaleString('vi-VN')}đ.`, '/my/documents');
    });
    flash(req, 'success', 'Mua tài liệu thành công! Tài liệu đã được thêm vào Thư viện của bạn.');
  } catch (e) {
    if (e.code !== 'INSUFFICIENT_FUNDS') return next(e);
    flash(req, 'error', e.message + ' Vui lòng nạp thêm tiền vào ví.');
  }
  res.redirect('/documents/' + doc.id);
});

router.post('/documents/:id/unlock', requireLogin, (req, res, next) => {
  const doc = loadDoc(req.params.id);
  if (!doc || doc.status !== 'approved' || doc.price > 0) return next();
  if (getAccess(req.user, doc).full) return res.redirect('/documents/' + doc.id);
  const cost = config.POINTS.unlockCost;
  if (req.user.points < cost) {
    flash(req, 'error', 'Bạn không đủ điểm. Hãy đăng tài liệu tự soạn để nhận điểm hoặc nâng cấp Premium.');
    return res.redirect('/documents/' + doc.id);
  }
  db.tx(() => {
    db.run('UPDATE users SET points = points - ? WHERE id = ?', [cost, req.user.id]);
    db.run('INSERT OR IGNORE INTO unlocks (user_id, document_id) VALUES (?, ?)', [req.user.id, doc.id]);
  });
  flash(req, 'success', `Đã mở khoá bằng ${cost} điểm.`);
  res.redirect('/documents/' + doc.id);
});

// ---------- Đánh giá ----------
router.post('/documents/:id/review', requireLogin, (req, res, next) => {
  const doc = loadDoc(req.params.id);
  if (!doc || doc.status !== 'approved') return next();
  const access = getAccess(req.user, doc);
  if (!access.full || access.reason === 'owner') {
    flash(req, 'error', 'Bạn cần có quyền xem đầy đủ (và không phải tác giả) để đánh giá.');
    return res.redirect('/documents/' + doc.id);
  }
  const rating = Math.min(5, Math.max(1, toInt(req.body.rating, 5)));
  const comment = String(req.body.comment || '').trim().slice(0, 1000);
  db.tx(() => {
    db.run(
      `INSERT INTO reviews (user_id, document_id, rating, comment) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, document_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = datetime('now')`,
      [req.user.id, doc.id, rating, comment]
    );
    db.run(
      'UPDATE documents SET rating_avg = (SELECT AVG(rating) FROM reviews WHERE document_id = ?), rating_count = (SELECT COUNT(*) FROM reviews WHERE document_id = ?) WHERE id = ?',
      [doc.id, doc.id, doc.id]
    );
  });
  flash(req, 'success', 'Cảm ơn bạn đã đánh giá!');
  res.redirect('/documents/' + doc.id + '#reviews');
});

router.post('/documents/:id/delete', requireLogin, (req, res, next) => {
  const doc = loadDoc(req.params.id);
  if (!doc || (doc.user_id !== req.user.id && req.user.role !== 'admin')) return next();
  db.run("UPDATE documents SET status = 'deleted' WHERE id = ?", [doc.id]);
  flash(req, 'success', 'Đã xoá tài liệu.');
  res.redirect('/my/documents');
});

// ---------- AI: tự sinh flashcard (Premium) ----------
router.post('/documents/:id/flashcards', requireLogin, (req, res, next) => {
  const doc = loadDoc(req.params.id);
  if (!canSee(req.user, doc)) return next();
  if (!isPremium(req.user) && req.user.role !== 'admin') {
    flash(req, 'warning', 'Tính năng tự sinh flashcard dành cho thành viên Premium.');
    return res.redirect('/premium');
  }
  if (!getAccess(req.user, doc).full) {
    flash(req, 'error', 'Bạn cần có quyền xem đầy đủ tài liệu.');
    return res.redirect('/documents/' + doc.id);
  }
  const cards = generateCards([doc.content, doc.extracted_text].filter(Boolean).join('\n'));
  if (!cards.length) {
    flash(req, 'warning', 'Không tìm thấy cặp thuật ngữ – định nghĩa phù hợp trong tài liệu này.');
    return res.redirect('/documents/' + doc.id);
  }
  const deckId = db.tx(() => {
    const id = db.run('INSERT INTO flashcard_decks (user_id, document_id, title, description) VALUES (?, ?, ?, ?)', [
      req.user.id, doc.id, 'Flashcard: ' + doc.title.slice(0, 80), 'Tự động sinh từ tài liệu #' + doc.id,
    ]).lastInsertRowid;
    for (const c of cards) db.run('INSERT INTO flashcards (deck_id, front, back) VALUES (?, ?, ?)', [id, c.front, c.back]);
    return id;
  });
  flash(req, 'success', `Đã tạo ${cards.length} flashcard từ tài liệu.`);
  res.redirect('/flashcards/' + deckId);
});

// ---------- Tài liệu của tôi / Thư viện ----------
router.get('/my/documents', requireLogin, (req, res) => {
  const docs = db.all(
    `${DOC_SELECT.replace('SELECT d.*,', `SELECT d.*, (SELECT COUNT(*) FROM purchases p WHERE p.document_id = d.id) AS sales,
      (SELECT COALESCE(SUM(price - commission), 0) FROM purchases p WHERE p.document_id = d.id) AS earned,`)}
     WHERE d.user_id = ? AND d.status != 'deleted' ORDER BY d.created_at DESC, d.id DESC`,
    [req.user.id]
  );
  const totals = docs.reduce((t, d) => ({ sales: t.sales + d.sales, earned: t.earned + d.earned }), { sales: 0, earned: 0 });
  res.render('documents/mine', { title: 'Tài liệu của tôi', docs, totals });
});

router.get('/my/library', requireLogin, (req, res) => {
  const purchased = db.all(
    `${DOC_SELECT} JOIN purchases p ON p.document_id = d.id WHERE p.user_id = ? AND d.status = 'approved' ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  const unlocked = db.all(
    `${DOC_SELECT} JOIN unlocks k ON k.document_id = d.id WHERE k.user_id = ? AND d.status = 'approved' ORDER BY k.created_at DESC`,
    [req.user.id]
  );
  res.render('documents/library', { title: 'Thư viện của tôi', purchased, unlocked });
});

module.exports = router;
