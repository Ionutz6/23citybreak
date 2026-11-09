(() => {
  const images = document.querySelectorAll('.article img.hero, .article .photos img');
  const links = document.querySelectorAll('[data-lightbox]');
  if (!images.length && !links.length) return;
  const viewer = document.createElement('dialog');
  viewer.className = 'image-viewer';
  viewer.setAttribute('aria-label', 'Imagine mărită. Apasă Escape sau în afara imaginii pentru a închide.');
  const enlarged = document.createElement('img');
  viewer.append(enlarged);
  document.body.append(viewer);
  let trigger;
  function open(source, alt, element) {
    trigger = element;
    enlarged.src = source;
    enlarged.alt = alt;
    viewer.showModal();
  }
  images.forEach(image => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', 'Mărește imaginea: ' + image.alt);
    image.addEventListener('click', () => open(image.currentSrc || image.src, image.alt, image));
    image.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); image.click(); }
    });
  });
  links.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    open(link.href, link.querySelector('img')?.alt || '', link);
  }));
  viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener('close', () => { enlarged.removeAttribute('src'); trigger?.focus(); });
})();

