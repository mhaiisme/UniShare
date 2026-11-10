const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireLogin, flash } = require('../middleware/auth');
const { generateQuiz } = require('../services/flashcardGen');
const { toInt, isPremium, sqlNow } = require('../utils');

const router = express.Router();
router.use('/flashcards', requireLogin);

const unlimited = (user) => isPremium(user) || user.role === 'admin';

function loadDeck(req) {
  return db.get('SELECT * FROM flashcard_decks WHERE id = ? AND user_id = ?', [toInt(req.params.id), req.user.id]);
}

function logErrorItem(userId, { deckId = null, documentId = null, question, answer }) {
  question = String(question || '').trim().slice(0, 500);
  answer = String(answer || '').trim().slice(0, 1000);
  if (!question || !answer) return;
  db.run(
    `INSERT INTO error_logs (user_id, deck_id, document_id, question, answer, wrong_count, resolved, last_wrong_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'))
     ON CONFLICT(user_id, question) DO UPDATE SET
       wrong_count = error_logs.wrong_count + 1,
       resolved = 0,
       last_wrong_at = datetime('now')`,
    [userId, deckId, documentId, question, answer]
  );
}

router.get('/flashcards', (req, res) => {
  const now = sqlNow();
  const decks = db.all(
    `SELECT d.*, (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) AS card_count,
       (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id AND (f.next_review IS NULL OR f.next_review <= ?)) AS due_count
     FROM flashcard_decks d WHERE d.user_id = ? ORDER BY d.id DESC`,
    [now, req.user.id]
  );
  const errorCount = db.get('SELECT COUNT(*) AS c FROM error_logs WHERE user_id = ? AND resolved = 0', [req.user.id]).c;
  res.render('flashcards/index', { title: 'Flashcard & Active Learning', decks, unlimited: unlimited(req.user), errorCount });
});

// ---------- Sổ tay bẫy đề thi / lỗi sai (Error Notebook) ----------
router.get('/flashcards/errors', (req, res) => {
  const showResolved = req.query.resolved === '1';
  const items = db.all(
    `SELECT e.*, d.title AS deck_title, doc.title AS doc_title
     FROM error_logs e
     LEFT JOIN flashcard_decks d ON d.id = e.deck_id
     LEFT JOIN documents doc ON doc.id = e.document_id
     WHERE e.user_id = ? AND (? = 1 OR e.resolved = 0)
     ORDER BY e.resolved ASC, e.wrong_count DESC, e.last_wrong_at DESC`,
    [req.user.id, showResolved ? 1 : 0]
  );
  res.render('flashcards/errors', { title: 'Sổ tay bẫy đề thi & Lỗi sai', items, showResolved });
});

router.post('/flashcards/errors/add', (req, res) => {
  const { question, answer, correct_answer, deck_id, document_id, back } = req.body;
  logErrorItem(req.user.id, {
    deckId: toInt(deck_id) || null,
    documentId: toInt(document_id) || null,
    question,
    answer: answer || correct_answer,
  });
  if (req.is('application/json')) return res.json({ ok: true });
  flash(req, 'success', 'Đã lưu vào Sổ tay bẫy đề thi để ôn lại trước giờ thi.');
  res.redirect(back && String(back).startsWith('/') ? back : '/flashcards/errors');
});

router.post('/flashcards/errors/:errorId/resolve', (req, res) => {
  const item = db.get('SELECT * FROM error_logs WHERE id = ? AND user_id = ?', [toInt(req.params.errorId), req.user.id]);
  if (item) {
    db.run('UPDATE error_logs SET resolved = ? WHERE id = ?', [item.resolved ? 0 : 1, item.id]);
  }
  res.redirect('/flashcards/errors');
});

router.post('/flashcards', (req, res) => {
  const title = String(req.body.title || '').trim();
  if (title.length < 2) {
    flash(req, 'error', 'Vui lòng nhập tên bộ thẻ.');
    return res.redirect('/flashcards');
  }
  const count = db.get('SELECT COUNT(*) AS c FROM flashcard_decks WHERE user_id = ?', [req.user.id]).c;
  if (!unlimited(req.user) && count >= config.FREE_DECK_LIMIT) {
    flash(req, 'warning', `Tài khoản thường chỉ tạo được ${config.FREE_DECK_LIMIT} bộ thẻ. Nâng cấp Premium để không giới hạn.`);
    return res.redirect('/premium');
  }
  const id = db.run('INSERT INTO flashcard_decks (user_id, title, description) VALUES (?, ?, ?)', [
    req.user.id, title, String(req.body.description || '').trim(),
  ]).lastInsertRowid;
  res.redirect('/flashcards/' + id);
});

router.get('/flashcards/:id', (req, res, next) => {
  const deck = loadDeck(req);
  if (!deck) return next();
  const cards = db.all('SELECT * FROM flashcards WHERE deck_id = ? ORDER BY id', [deck.id]);
  res.render('flashcards/deck', { title: deck.title, deck, cards, unlimited: unlimited(req.user) });
});

router.post('/flashcards/:id/cards', (req, res, next) => {
  const deck = loadDeck(req);
  if (!deck) return next();
  const front = String(req.body.front || '').trim();
  const back = String(req.body.back || '').trim();
  const count = db.get('SELECT COUNT(*) AS c FROM flashcards WHERE deck_id = ?', [deck.id]).c;
  if (!front || !back) flash(req, 'error', 'Vui lòng nhập cả mặt trước và mặt sau.');
  else if (!unlimited(req.user) && count >= config.FREE_CARD_LIMIT)
    flash(req, 'warning', `Tài khoản thường tối đa ${config.FREE_CARD_LIMIT} thẻ/bộ. Nâng cấp Premium để thêm.`);
  else db.run('INSERT INTO flashcards (deck_id, front, back) VALUES (?, ?, ?)', [deck.id, front.slice(0, 500), back.slice(0, 1000)]);
  res.redirect('/flashcards/' + deck.id);
});

router.post('/flashcards/:id/cards/:cardId/delete', (req, res, next) => {
  const deck = loadDeck(req);
  if (!deck) return next();
  db.run('DELETE FROM flashcards WHERE id = ? AND deck_id = ?', [toInt(req.params.cardId), deck.id]);
  res.redirect('/flashcards/' + deck.id);
});

router.post('/flashcards/:id/delete', (req, res, next) => {
  const deck = loadDeck(req);
  if (!deck) return next();
  db.tx(() => {
    db.run('DELETE FROM flashcards WHERE deck_id = ?', [deck.id]);
    db.run('DELETE FROM flashcard_decks WHERE id = ?', [deck.id]);
  });
  flash(req, 'success', 'Đã xoá bộ thẻ.');
  res.redirect('/flashcards');
});

router.get('/flashcards/:id/study', (req, res, next) => {
  const deck = loadDeck(req);
  if (!deck) return next();
  let cards = db.all('SELECT id, front, back, box FROM flashcards WHERE deck_id = ? AND (next_review IS NULL OR next_review <= ?) ORDER BY box, id', [deck.id, sqlNow()]);
  const all = req.query.all === '1';
  if (all) cards = db.all('SELECT id, front, back, box FROM flashcards WHERE deck_id = ? ORDER BY box, id', [deck.id]);
  res.render('flashcards/study', { title: 'Học: ' + deck.title, deck, cards, all });
});

// Leitner: nhớ -> lên hộp; quên -> về hộp 1 & tự động lưu vào Sổ tay bẫy đề thi
router.post('/flashcards/:id/cards/:cardId/review', (req, res) => {
  const deck = loadDeck(req);
  if (!deck) return res.status(404).json({ error: 'not found' });
  const card = db.get('SELECT * FROM flashcards WHERE id = ? AND deck_id = ?', [toInt(req.params.cardId), deck.id]);
  if (!card) return res.status(404).json({ error: 'not found' });
  const good = req.body.result === 'good';
  const box = good ? Math.min(5, card.box + 1) : 1;
  const days = good ? config.LEITNER_DAYS[box] : 0;
  const next = sqlNow(days * 24 * 3600 * 1000 + (good ? 0 : 60 * 1000));
  db.run('UPDATE flashcards SET box = ?, next_review = ? WHERE id = ?', [box, next, card.id]);
  if (!good) {
    logErrorItem(req.user.id, { deckId: deck.id, documentId: deck.document_id, question: card.front, answer: card.back });
  }
  res.json({ ok: true, box, next_review: next, loggedError: !good });
});

router.get('/flashcards/:id/quiz', (req, res, next) => {
  const deck = loadDeck(req);
  if (!deck) return next();
  if (!unlimited(req.user)) {
    flash(req, 'warning', 'Phòng thi thử & Quiz trắc nghiệm là tính năng Premium.');
    return res.redirect('/premium');
  }
  const cards = db.all('SELECT * FROM flashcards WHERE deck_id = ?', [deck.id]);
  if (cards.length < 4) {
    flash(req, 'warning', 'Cần ít nhất 4 thẻ để tạo đề thi thử.');
    return res.redirect('/flashcards/' + deck.id);
  }
  const rawMin = toInt(req.query.duration || req.query.minutes);
  const duration = [5, 15, 30, 45].includes(rawMin) ? rawMin : 15;
  res.render('flashcards/quiz', { title: 'Phòng thi thử: ' + deck.title, deck, questions: generateQuiz(cards, 15), duration });
});

// Lưu các câu làm sai trong Phòng thi thử vào Sổ tay bẫy đề thi
router.post('/flashcards/:id/quiz/submit', (req, res) => {
  const deck = loadDeck(req);
  if (!deck) return res.status(404).json({ error: 'not found' });
  const rawList = Array.isArray(req.body.wrongItems) ? req.body.wrongItems : Array.isArray(req.body.wrong) ? req.body.wrong : [];
  db.tx(() => {
    for (const item of rawList.slice(0, 50)) {
      logErrorItem(req.user.id, {
        deckId: deck.id,
        documentId: deck.document_id,
        question: item.question,
        answer: item.correctAnswer || item.answer,
      });
    }
  });
  res.json({ ok: true, savedErrors: rawList.length });
});

module.exports = router;
