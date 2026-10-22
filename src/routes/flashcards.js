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

router.get('/flashcards', (req, res) => {
  const now = sqlNow();
  const decks = db.all(
    `SELECT d.*, (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id) AS card_count,
       (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id AND (f.next_review IS NULL OR f.next_review <= ?)) AS due_count
     FROM flashcard_decks d WHERE d.user_id = ? ORDER BY d.id DESC`,
    [now, req.user.id]
  );
  res.render('flashcards/index', { title: 'Flashcard', decks, unlimited: unlimited(req.user) });
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

// Leitner: nhớ -> lên hộp; quên -> về hộp 1
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
  res.json({ ok: true, box, next_review: next });
});

router.get('/flashcards/:id/quiz', (req, res, next) => {
  const deck = loadDeck(req);
  if (!deck) return next();
  if (!unlimited(req.user)) {
    flash(req, 'warning', 'Quiz trắc nghiệm là tính năng Premium.');
    return res.redirect('/premium');
  }
  const cards = db.all('SELECT * FROM flashcards WHERE deck_id = ?', [deck.id]);
  if (cards.length < 4) {
    flash(req, 'warning', 'Cần ít nhất 4 thẻ để tạo quiz.');
    return res.redirect('/flashcards/' + deck.id);
  }
  res.render('flashcards/quiz', { title: 'Quiz: ' + deck.title, deck, questions: generateQuiz(cards) });
});

module.exports = router;
