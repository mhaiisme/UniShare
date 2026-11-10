/**
 * Hệ thống Active Learning Loop (Study Tools):
 *  1. Sinh bộ thẻ Flashcard từ văn bản (generateCards)
 *  2. Sinh đề thi thử trắc nghiệm 4 đáp án (generateQuiz)
 *  3. Sinh Lộ trình ôn thi nước rút theo ngày 3 / 7 / 14 ngày (generateRoadmap)
 *  4. Sinh Bộ câu hỏi phân tầng 3 mức độ kèm Gợi ý tư duy 3 bước (generatePracticeBank)
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
      return { id: c.id, question: c.front, back: c.back, options, answer: options.indexOf(c.back) };
    });
}

function extractSections(text) {
  const lines = String(text || '').split(/\r?\n/);
  const sections = [];
  let current = { title: 'Tổng quan & Khái niệm nền tảng', bullets: [] };
  for (const raw of lines) {
    const h = raw.match(/^#{1,3}\s+(.*)$/);
    if (h) {
      if (current.bullets.length) sections.push(current);
      current = { title: cleanLine(h[1]), bullets: [] };
      continue;
    }
    const cleaned = cleanLine(raw);
    if (cleaned.length >= 10 && cleaned.length <= 300) {
      current.bullets.push(cleaned);
    }
  }
  if (current.bullets.length) sections.push(current);
  return sections;
}

/**
 * Sinh Lộ trình ôn thi nước rút theo ngày (3, 7 hoặc 14 ngày).
 */
function generateRoadmap(doc, cards = [], days = 7) {
  days = [3, 7, 14].includes(Number(days)) ? Number(days) : 7;
  const text = [doc.content, doc.extracted_text].filter(Boolean).join('\n');
  const extracted = cards.length ? cards : generateCards(text, 30);
  const sections = extractSections(text);
  const courseLabel = doc.course_code ? `${doc.course_code} – ${doc.course_name || ''}` : doc.title;

  const plan = [];
  for (let d = 1; d <= days; d++) {
    const isLast = d === days;
    const isPenultimate = d === days - 1 && days >= 3;
    const sec = sections[(d - 1) % Math.max(1, sections.length)];
    const sliceSize = Math.max(1, Math.ceil(extracted.length / Math.max(1, days - 1)));
    const dayCards = extracted.slice(((d - 1) * sliceSize) % Math.max(1, extracted.length), ((d - 1) * sliceSize) % Math.max(1, extracted.length) + sliceSize);

    let focus;
    let tasks;
    if (isLast) {
      focus = 'Tổng rà soát bẫy đề thi & Thi thử bấm giờ';
      tasks = [
        `Mở "Sổ tay bẫy đề thi" để rà soát lại các câu từng làm sai của học phần ${courseLabel}`,
        'Làm 1 đề thi thử bấm giờ (Mock Exam) trong điều kiện không mở tài liệu',
        'Đọc lướt lại bảng công thức / định nghĩa cốt lõi 30 phút trước giờ thi, nghỉ ngơi sớm',
      ];
    } else if (isPenultimate) {
      focus = 'Luyện câu hỏi tự luận phân loại & Gợi ý 3 bước';
      tasks = [
        `Hoàn thành bộ câu hỏi Vận dụng & Tự luận có gợi ý từng bước của ${courseLabel}`,
        'Tự trình bày lời giải ra giấy nháp, đối chiếu điều kiện biên và thang điểm',
        'Ôn lại các thẻ Flashcard đang ở Hộp 1 và Hộp 2 (chưa thuộc kỹ)',
      ];
    } else {
      focus = sec ? sec.title : `Trọng tâm học phần – Phần ${d}`;
      tasks = [
        `Đọc kỹ và tự tóm tắt lại mục "${focus}" (${sec ? Math.min(4, sec.bullets.length) : 3} ý chính)`,
        `Học và lật ${dayCards.length || 3} thẻ Flashcard thuộc chủ đề ngày ${d} theo phương pháp Leitner`,
        'Tự giải ít nhất 2 câu hỏi ôn tập không nhìn đáp án trước khi mở Gợi ý',
      ];
    }

    plan.push({
      day: d,
      focus,
      estMinutes: isLast ? 45 : 60,
      tasks,
      keyPoints: sec ? sec.bullets.slice(0, 3) : [],
      concepts: dayCards.slice(0, 4),
    });
  }
  return { days, courseLabel, totalCards: extracted.length, plan };
}

/**
 * Sinh Bộ câu hỏi phân tầng 3 mức độ kèm Gợi ý tư duy 3 bước (Step-by-step Hints).
 */
function generatePracticeBank(doc, cards = []) {
  const text = [doc.content, doc.extracted_text].filter(Boolean).join('\n');
  const extracted = cards.length ? cards : generateCards(text, 30);
  const sections = extractSections(text);
  const courseCode = doc.course_code || 'Học phần';

  // Tầng 1: Nhận biết
  const tier1 = extracted.slice(0, 8).map((c, idx) => ({
    index: idx + 1,
    question: `Trình bày khái niệm / bản chất của "${c.front}" trong ${courseCode}?`,
    keyTerm: c.front,
    answer: c.back,
  }));

  // Tầng 2: Vận dụng & Bẫy thường gặp
  const tier2 = extracted.slice(0, 6).map((c, idx) => {
    const next = extracted[(idx + 1) % extracted.length] || c;
    return {
      index: idx + 1,
      question:
        c.front !== next.front
          ? `Phân biệt điều kiện áp dụng giữa "${c.front}" và "${next.front}" khi giải bài tập ${courseCode}?`
          : `Khi áp dụng "${c.front}", sinh viên thường mắc sai lầm ở bước nào?`,
      hint: `Đối chiếu định nghĩa gốc của "${c.front}" và kiểm tra điều kiện biên trước khi kết luận.`,
      answer: `• ${c.front}: ${c.back}\n• ${next.front}: ${next.back}\n• Lưu ý phòng thi: Luôn nêu rõ điều kiện áp dụng trước khi thay số/công thức để không mất điểm trình bày.`,
    };
  });

  // Tầng 3: Tự luận / Bài tập lớn có Gợi ý 3 bước (Step-by-step Hints)
  const tier3Source = sections.length
    ? sections
    : [{ title: doc.title, bullets: extracted.map((c) => `${c.front}: ${c.back}`) }];

  const tier3 = tier3Source.slice(0, 5).map((s, idx) => {
    const b0 = s.bullets[0] || `Xác định mô hình và giả thiết của ${s.title}`;
    const b1 = s.bullets[1] || b0;
    const b2 = s.bullets[2] || 'Đối chiếu điều kiện xác định và kết luận theo yêu cầu đề bài.';
    return {
      index: idx + 1,
      topic: s.title,
      question: `[Bài tập tự luận #${idx + 1} – ${courseCode}] Phân tích và trình bày quy trình giải bài toán thuộc chủ đề "${s.title}". Nêu rõ các giả thiết, bước biến đổi trung gian và cách kiểm tra nghiệm.`,
      hint1: `Gợi ý bước 1 (Nhận diện công cụ & giả thiết): Xác định bài toán thuộc phần "${s.title}". Xuất phát từ nguyên lý: ${b0}`,
      hint2: `Gợi ý bước 2 (Biến đổi trung gian): Thiết lập biểu thức / quy trình chuẩn theo: ${b1}`,
      solution: `Lời giải chuẩn & Thang điểm tham khảo:\n1. (0.5đ) Nêu đúng giả thiết và điều kiện áp dụng: ${b0}\n2. (1.0đ) Thực hiện biến đổi / triển khai từng bước: ${b1}\n3. (0.5đ) Kiểm tra điều kiện biên và kết luận: ${b2}`,
    };
  });

  return { tier1, tier2, tier3 };
}

module.exports = { generateCards, generateQuiz, generateRoadmap, generatePracticeBank };
