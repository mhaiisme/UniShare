/* Motion enhances existing interactions; server responses remain authoritative. */
(() => {
  'use strict';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set();
  function play(element, frames, options) {
    if (!element || preference.matches || !element.animate) return null;
    const animation = element.animate(frames, options);
    active.add(animation);
    animation.finished.catch(() => {}).finally(() => active.delete(animation));
    return animation;
  }
  preference.addEventListener('change', () => {
    if (preference.matches) active.forEach(animation => animation.cancel());
  });

  // Reveal once, without a hidden initial class: no blank cards if JS fails.
  const targets = document.querySelectorAll('.section-head,.doc-card,.listing-card,.school-item,.forum-post,.forum-side-panel,.study-corner,.forum-header,.knowledge-map,.community-strip');
  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        reveal.unobserve(entry.target);
        const siblings = Array.from(entry.target.parentElement.children);
        const delay = Math.min(siblings.indexOf(entry.target), 5) * 40;
        play(entry.target, [{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}], {duration:280,delay,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'});
      });
    }, {threshold:0,rootMargin:'0px 0px -24px 0px'});
    targets.forEach(target => reveal.observe(target));

    const diagrams = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        diagrams.unobserve(entry.target);
        if (preference.matches) return;
        entry.target.querySelectorAll('.diagram-link,.diagram-trend,.knowledge-route path').forEach((path, index) => {
          if (!path.getTotalLength || path.hasAttribute('stroke-dasharray')) return;
          const length = path.getTotalLength();
          play(path, [{strokeDasharray:`${length} ${length}`,strokeDashoffset:length},{strokeDasharray:`${length} ${length}`,strokeDashoffset:0}],{duration:320,delay:Math.min(index,3)*40,easing:'ease-out',fill:'backwards'});
        });
        entry.target.querySelectorAll('.diagram-dot,.knowledge-route circle').forEach((dot, index) => {
          play(dot,[{opacity:0},{opacity:1}],{duration:200,delay:Math.min(index,5)*40,easing:'ease-out',fill:'backwards'});
        });
        if (entry.target.matches('.knowledge-journey')) {
          entry.target.querySelectorAll('a').forEach((link,index) => play(link,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,delay:index*40,easing:'ease-out',fill:'backwards'}));
        }
      });
    },{threshold:.15});
    document.querySelectorAll('.paper-diagram,.knowledge-journey').forEach(target => diagrams.observe(target));
  }

  const logo = document.querySelector('.topbar .brand-mark');
  let opened = false;
  try { opened = sessionStorage.getItem('unishare-logo-opened') === 'yes'; } catch (_) {}
  if (logo && !opened && !preference.matches) {
    logo.classList.add('brand-opening');
    logo.addEventListener('animationend', () => logo.classList.remove('brand-opening'), {once:true});
    try { sessionStorage.setItem('unishare-logo-opened','yes'); } catch (_) {}
  }

  // Sample card has its existing click handler; animate the changed face.
  const sample = document.getElementById('sample-flip');
  if (sample) sample.addEventListener('click', () => {
    play(sample,[{transform:'perspective(800px) rotateY(-75deg)',opacity:.5},{transform:'perspective(800px) rotateY(0)',opacity:1}],{duration:240,easing:'ease-out'});
  });

  const feedback = document.createElement('div');
  feedback.className = 'motion-feedback';
  feedback.setAttribute('role','status');
  feedback.setAttribute('aria-live','polite');
  document.body.appendChild(feedback);
  let clearFeedback;
  function announce(message) {
    clearTimeout(clearFeedback);
    feedback.textContent = message;
    play(feedback,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'ease-out'});
    clearFeedback = setTimeout(() => {
      const exit = play(feedback,[{opacity:1},{opacity:0}],{duration:160,easing:'ease-in'});
      if (exit) exit.finished.then(() => { feedback.textContent = ''; }).catch(() => {});
      else feedback.textContent = '';
    },4000);
  }

  // Actual persisted checklist change only; no simulated save success.
  document.querySelectorAll('[data-roadmap-doc] input[data-task-id]').forEach(input => {
    input.addEventListener('change', () => {
      const wrap = input.closest('[data-roadmap-doc]');
      try {
        const saved = JSON.parse(localStorage.getItem('unishare_roadmap_' + wrap.dataset.roadmapDoc) || '{}');
        if (Boolean(saved[input.dataset.taskId]) === input.checked) announce(input.checked ? 'Đã lưu tiến độ ôn tập.' : 'Đã cập nhật tiến độ ôn tập.');
        else announce('Chưa lưu được tiến độ trên trình duyệt này.');
      } catch (_) { announce('Chưa lưu được tiến độ trên trình duyệt này.'); }
    });
  });

  // Native form submission keeps existing authentication and validation intact.
  document.addEventListener('submit', event => {
    if (event.defaultPrevented || event.target.method.toLowerCase() !== 'post') return;
    const button = event.submitter;
    if (!button) return;
    button.setAttribute('aria-busy','true');
    const label = button.querySelector('[data-submit-label]');
    if (label) label.textContent = 'Đang gửi…';
  });
  window.addEventListener('pageshow', () => document.querySelectorAll('[aria-busy=true]').forEach(element => element.removeAttribute('aria-busy')));

  const success = document.querySelector('.alert-success');
  if (success) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.classList.add('action-receipt');
    icon.setAttribute('viewBox','0 0 24 24');
    icon.setAttribute('aria-hidden','true');
    icon.setAttribute('fill','none');
    icon.setAttribute('stroke','currentColor');
    icon.setAttribute('stroke-width','2');
    const check = document.createElementNS('http://www.w3.org/2000/svg','path');
    check.setAttribute('d','M5 12l4 4L19 6');
    check.setAttribute('stroke-linecap','round');
    check.setAttribute('stroke-linejoin','round');
    icon.appendChild(check);
    success.prepend(icon);
    play(icon,[{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'scale(1)'}],{duration:240,easing:'ease-out'});
  }
  const commentMatch = /^#comment-(\d+)$/.exec(location.hash);
  if (success && commentMatch) {
    const comment = document.getElementById('comment-' + commentMatch[1]);
    if (comment) {
      comment.classList.add('is-new-comment');
      const badge = document.createElement('span');
      badge.className = 'comment-received';
      badge.textContent = 'Vừa gửi thành công';
      comment.querySelector('.forum-comment-content')?.prepend(badge);
      play(comment,[{opacity:.4,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'ease-out'});
      setTimeout(() => { comment.classList.remove('is-new-comment'); badge.remove(); },6000);
    }
  }
})();
