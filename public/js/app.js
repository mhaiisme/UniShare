// 1. Gợi ý mã môn học theo trường khi đăng tài liệu
(function () {
  const schoolSel = document.querySelector('[data-course-school]');
  const codeInput = document.querySelector('[data-course-code]');
  const nameInput = document.querySelector('[data-course-name]');
  const list = document.getElementById('course-list');
  if (!schoolSel || !list) return;
  let courses = [];
  async function load() {
    list.innerHTML = '';
    if (!schoolSel.value) return;
    const res = await fetch('/api/courses?school_id=' + encodeURIComponent(schoolSel.value));
    courses = await res.json();
    for (const c of courses) {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.label = c.name;
      list.appendChild(opt);
    }
  }
  schoolSel.addEventListener('change', load);
  if (codeInput && nameInput) {
    codeInput.addEventListener('input', () => {
      const hit = courses.find((c) => c.code.toUpperCase() === codeInput.value.trim().toUpperCase());
      if (hit) nameInput.value = hit.name;
    });
  }
  load();
})();

// 2. Anti-piracy trên trình đọc tài liệu: chặn copy/contextmenu/Ctrl+S/Ctrl+P & di chuyển watermark ngẫu nhiên
(function () {
  const viewer = document.getElementById('doc-viewer');
  if (!viewer) return;
  ['copy', 'cut', 'contextmenu', 'dragstart'].forEach((ev) =>
    viewer.addEventListener(ev, (e) => e.preventDefault())
  );
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['p', 's', 'u'].includes(e.key.toLowerCase())) e.preventDefault();
  });
  const move = (el) => {
    if (!el) return;
    el.style.top = 10 + Math.floor(Math.random() * 75) + '%';
    el.style.left = 5 + Math.floor(Math.random() * 60) + '%';
  };
  setInterval(() => {
    move(document.getElementById('wm-floating'));
    move(document.getElementById('video-wm'));
  }, 4000);
})();

// 3. Học Flashcard (Leitner)
(function () {
  const cards = window.FC_CARDS;
  if (!cards || !cards.length) return;
  let i = 0;
  let flipped = false;
  const front = document.getElementById('fc-front');
  const back = document.getElementById('fc-back');
  const prog = document.getElementById('fc-progress');
  function show() {
    const c = cards[i];
    flipped = false;
    front.hidden = false;
    back.hidden = true;
    front.textContent = c.front;
    back.textContent = c.back;
    prog.textContent = `Thẻ ${i + 1} / ${cards.length} (Hộp ${c.box}/5) · Bấm vào thẻ hoặc Space để lật`;
  }
  window.flipCard = function () {
    flipped = !flipped;
    front.hidden = flipped;
    back.hidden = !flipped;
  };
  window.gradeCard = async function (result) {
    const c = cards[i];
    await fetch(`/flashcards/${window.FC_DECK_ID}/cards/${c.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result }),
    });
    i++;
    if (i >= cards.length) {
      document.getElementById('fc-box').innerHTML = '🎉 Hoàn thành phiên học!';
      prog.textContent = `Đã ôn xong ${cards.length} thẻ.`;
    } else show();
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); window.flipCard(); }
  });
  show();
})();

// 4. Phòng thi thử bấm giờ (Timed Mock Exam Simulator) & tự động lưu câu sai vào Sổ tay bẫy đề thi
(function () {
  const form = document.getElementById('quiz-form');
  if (!form) return;
  const timerEl = document.getElementById('exam-timer');
  const tabCountEl = document.getElementById('tab-count');
  let submitted = false;
  let tabSwitches = 0;

  // Cảnh báo chuyển tab khi đang làm bài thi
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !submitted && tabCountEl) {
      tabSwitches++;
      tabCountEl.textContent = String(tabSwitches);
      const warnBadge = document.getElementById('tab-warning');
      if (warnBadge) warnBadge.classList.add('tag-danger');
    }
  });

  // Đồng hồ đếm ngược
  let remainingSec = (timerEl ? Number(timerEl.dataset.minutes || 15) : 15) * 60;
  const interval = setInterval(() => {
    if (submitted || !timerEl) return;
    remainingSec = Math.max(0, remainingSec - 1);
    const m = String(Math.floor(remainingSec / 60)).padStart(2, '0');
    const s = String(remainingSec % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
    if (remainingSec <= 60) timerEl.classList.add('timer-urgent');
    if (remainingSec === 0) {
      clearInterval(interval);
      form.requestSubmit();
    }
  }, 1000);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitted) return;
    submitted = true;
    clearInterval(interval);

    const qs = form.querySelectorAll('.quiz-q');
    let right = 0;
    const wrongItems = [];
    qs.forEach((q, idx) => {
      const ans = Number(q.dataset.answer);
      const chosen = form.querySelector(`input[name="q${idx}"]:checked`);
      q.querySelectorAll('.quiz-opt').forEach((opt, oi) => {
        opt.classList.remove('correct', 'wrong');
        if (oi === ans) opt.classList.add('correct');
        else if (chosen && Number(chosen.value) === oi) opt.classList.add('wrong');
      });
      if (chosen && Number(chosen.value) === ans) {
        right++;
      } else {
        wrongItems.push({
          question: q.dataset.question || q.querySelector('h3').textContent,
          chosenAnswer: chosen ? (chosen.dataset.optText || '') : 'Chưa chọn (Hết giờ)',
          correctAnswer: q.dataset.correctText || '',
        });
      }
    });

    const deckId = form.dataset.deckId;
    if (deckId && wrongItems.length > 0) {
      try {
        await fetch(`/flashcards/${deckId}/quiz/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wrongItems }),
        });
      } catch (_) {}
    }

    const score = document.getElementById('quiz-score');
    score.hidden = false;
    const pct = Math.round((right * 100) / qs.length);
    score.innerHTML = `<strong>Kết quả: đúng ${right}/${qs.length} câu (${pct} điểm)</strong> · Số lần rời màn hình: ${tabSwitches}. ${
      wrongItems.length
        ? `Đã tự động lưu <strong>${wrongItems.length} câu làm sai</strong> vào <a href="/flashcards/errors"><strong>Sổ tay bẫy đề thi</strong></a> để bạn ôn lại.`
        : 'Xuất sắc! Bạn không mắc lỗi sai nào.'
    }`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// 5. Lưu trạng thái Checklist Lộ trình ôn thi 3-7-14 ngày trên trình duyệt
(function () {
  const wrap = document.querySelector('[data-roadmap-doc]');
  if (!wrap) return;
  const key = 'unishare_roadmap_' + wrap.dataset.roadmapDoc;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) {}
  wrap.querySelectorAll('input[type="checkbox"][data-task-id]').forEach((cb) => {
    const id = cb.dataset.taskId;
    if (saved[id]) cb.checked = true;
    cb.addEventListener('change', () => {
      saved[id] = cb.checked;
      try { localStorage.setItem(key, JSON.stringify(saved)); } catch (_) {}
    });
  });
})();
