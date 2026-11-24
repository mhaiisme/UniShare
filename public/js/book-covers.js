/* Preserve seller photographs; use the same subject cover if one cannot load. */
(() => {
  function revealCover(photo) {
    if (!photo || !photo.matches || !photo.matches('[data-book-photo]')) return;
    const media = photo.closest('[data-book-media]');
    const cover = media && media.querySelector('[data-book-fallback]');
    if (!cover) return;
    photo.hidden = true;
    cover.hidden = false;
  }
  document.addEventListener('error', event => revealCover(event.target), true);
  document.querySelectorAll('[data-book-photo]').forEach(photo => {
    if (photo.complete && photo.naturalWidth === 0) revealCover(photo);
  });
})();
