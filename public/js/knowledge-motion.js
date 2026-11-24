/* Interaction effects preserve application data. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const soundControl = document.querySelector('[data-sound-toggle]');
  let soundEnabled = false;
  try { soundEnabled = localStorage.getItem('unishare-sound') === 'on'; } catch (_) {}
  const updateSound = () => {
    if (!soundControl) return;
    soundControl.setAttribute('aria-pressed', String(soundEnabled));
    const state = soundControl.querySelector('[data-sound-state]');
    if (state) state.textContent = soundEnabled ? 'Bật' : 'Tắt';
    soundControl.title = soundEnabled ? 'Tắt âm thanh hiệu ứng' : 'Bật âm thanh hiệu ứng';
  };
  let audio;
  function tone(kind) {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audio = audio || new AudioContext();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(kind === 'flip' ? 440 : 540, now);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'flip' ? 560 : 720, now + .1);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.025, now + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .16);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now); oscillator.stop(now + .17);
    } catch (_) { /* Audio may be unavailable in this browser. */ }
  }
  updateSound();
  soundControl?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem('unishare-sound', soundEnabled ? 'on' : 'off'); } catch (_) {}
    updateSound();
    if (soundEnabled) tone('confirm');
  });
  document.querySelectorAll('#fc-box, #sample-flip').forEach(card => {
    card.addEventListener('click', () => { if (card.getAttribute('aria-disabled') !== 'true') tone('flip'); });
    if (card.id === 'fc-box') card.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.code === 'Space') && card.getAttribute('aria-disabled') !== 'true') tone('flip');
    });
  });
  window.addEventListener('keydown', event => {
    if (event.code === 'Space' && !event.repeat && !event.target.closest('input,textarea,select,button,a,[contenteditable=true],#fc-box') && document.querySelector('#fc-box:not([aria-disabled="true"])')) tone('flip');
  });
  const bird = document.querySelector('.knowledge-bird');
  if (bird && !reduced.matches) bird.classList.add('is-flying');

  const form = document.querySelector('.forum-reply form');
  const field = document.querySelector('#forum-reply-body');
  const draftKey = 'unishare-comment-draft:' + location.pathname;
  const commentSuccess = Boolean(document.querySelector('.alert-success') && /^#comment-\d+$/.test(location.hash));
  if (field) {
    try {
      if (commentSuccess) sessionStorage.removeItem(draftKey);
      else if (!field.value) field.value = sessionStorage.getItem(draftKey) || '';
      field.addEventListener('input', () => { try { sessionStorage.setItem(draftKey, field.value); } catch (_) {} });
    } catch (_) {}
  }
  form?.addEventListener('submit', event => {
    if (event.defaultPrevented) return;
    const button = event.submitter || form.querySelector('button[type=submit]');
    if (button) { button.setAttribute('aria-busy','true'); const label = button.querySelector('[data-submit-label]'); if (label) label.textContent = 'Đang gửi…'; }
    try { if (field) sessionStorage.setItem(draftKey, field.value); } catch (_) {}
  });
  window.addEventListener('pageshow', () => {
    const button = form?.querySelector('button[type=submit]');
    if (button) { button.removeAttribute('aria-busy'); const label = button.querySelector('[data-submit-label]'); if (label) label.textContent = 'Gửi phản hồi'; }
  });
  if (commentSuccess) {
    const comment = document.getElementById(location.hash.slice(1));
    if (comment && !reduced.matches) {
      const flying = document.createElement('div');
      flying.className = 'comment-bird'; flying.setAttribute('aria-hidden','true');
      flying.innerHTML = '<svg class="paper-bird" viewBox="0 0 120 84" width="120" height="84" aria-hidden="true"><path d="M7 43 48 31 76 5 68 32 111 18 84 54 69 58 61 75 53 53Z" fill="#d9ecff" stroke="#285d9f" stroke-width="2.5" stroke-linejoin="round"/><path d="M48 31 68 32 53 53M68 32 84 54M53 53 61 75" fill="none" stroke="#285d9f" stroke-width="2"/></svg>';
      (comment.querySelector('.forum-comment-content') || comment).appendChild(flying); flying.addEventListener('animationend', () => flying.remove(), {once:true});
    }
  }
  const fc = document.querySelector('#fc-box');
  if (fc) new MutationObserver(() => {
    if (fc.getAttribute('aria-disabled') === 'true') {
      fc.classList.add('is-complete');
      if (!reduced.matches && fc.animate) fc.animate([{transform:'scale(.97)'},{transform:'scale(1)'}],{duration:280,easing:'ease-out'});
    }
  }).observe(fc,{attributes:true,attributeFilter:['aria-disabled']});
  if ('IntersectionObserver' in window && !reduced.matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      if (entry.target.animate) entry.target.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'ease-out'});
    }),{threshold:.1});
    document.querySelectorAll('.search-empty,.forum-comments-empty,.forum-comment,.page-narrow > h1,.page-narrow > .card').forEach(el => observer.observe(el));
  }
})();
