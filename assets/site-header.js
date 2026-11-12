// Header comun: butonul de meniu pe mobil și eticheta contului pe paginile fără account.js.
(() => {
  const header = document.querySelector('.cb-header'); if (!header) return;
  const toggle = header.querySelector('.cb-menu-toggle');
  const setOpen = open => {
    header.classList.toggle('is-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
  };
  toggle?.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
  header.querySelectorAll('.cb-nav a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  // account.js (unde e încărcat) actualizează singur eticheta și deschide loginul; aici doar o setăm corect de la început.
  const acct = document.getElementById('account-link');
  try { if (acct && localStorage.getItem('sb-lsudthnrumslfscpppix-auth-token')) acct.textContent = 'Contul tău'; } catch {}
})();
