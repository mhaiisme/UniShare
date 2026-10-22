/**
 * "AI Study Tools" (bản heuristic chạy offline):
 *  - Sinh flashcard từ văn bản theo các mẫu định nghĩa phổ biến.
 *  - Sinh đề trắc nghiệm 4 đáp án từ bộ thẻ.
 * Có thể thay bằng LLM thật (Gemini/OpenAI) mà không đổi giao diện hàm.
 */
const { shuffle } = require('../utils');

function cleanLine(l) {
  return l
    .replace(/^[\s>#*+\-\d.)]+/, '')
    .replace(/\*\*|__|`/g, '')
    .trim();
}

function generateCards(text, max = 40) {
  const cards = [];
  const seen = new Set();
  const push = (front, back) => {
    front = front.trim().replace(/[:\s]+$/, '');
    back = back.trim();
    if (front.length < 2 || back.length < 3 || front.length > 120) return;
    const key = front.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cards.push({ front, back });
  };
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (cards.length >= max) break;
    const line = cleanLine(raw);
    if (line.length < 6 || line.length > 400) continue;
    let m;
    if ((m = line.match(/^(.{2,100}?)\s*[:：]\s+(.{3,})$/))) {
      push(m[1], m[2]);
    } else if ((m = line.match(/^(.{2,100}?)\s+[–—-]\s+(.{3,})$/))) {
      push(m[1], m[2]);
    } else if ((m = line.match(/^(.{2,80}?)\s+(được định nghĩa là|được gọi là|là|is|are)\s+(.{3,})$/i))) {
      push(`${m[1]} ${/^(is|are)$/i.test(m[2]) ? 'is...?' : 'là gì?'}`, m[3]);
    }
  }
  return cards;
}

function generateQuiz(cards, count = 10) {
  if (cards.length < 4) return [];
  return shuffle(cards)
    .slice(0, count)
    .map((c) => {
      const distractors = shuffle(cards.filter((o) => o.id !== c.id && o.back !== c.back))
        .slice(0, 3)
        .map((o) => o.back);
      const options = shuffle([c.back, ...distractors]);
      return { question: c.front, options, answer: options.indexOf(c.back) };
    });
}

module.exports = { generateCards, generateQuiz };
