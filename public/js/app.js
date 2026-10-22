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

// 4. Chấm Quiz trắc nghiệm
(function () {
  const form = document.getElementById('quiz-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const qs = form.querySelectorAll('.quiz-q');
    let right = 0;
    qs.forEach((q, idx) => {
      const ans = Number(q.dataset.answer);
      const chosen = form.querySelector(`input[name="q${idx}"]:checked`);
      q.querySelectorAll('.quiz-opt').forEach((opt, oi) => {
        opt.classList.remove('correct', 'wrong');
        if (oi === ans) opt.classList.add('correct');
        else if (chosen && Number(chosen.value) === oi) opt.classList.add('wrong');
      });
      if (chosen && Number(chosen.value) === ans) right++;
    });
    const score = document.getElementById('quiz-score');
    score.hidden = false;
    score.textContent = `Kết quả: đúng ${right}/${qs.length} câu (${Math.round((right * 100) / qs.length)} điểm).`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
