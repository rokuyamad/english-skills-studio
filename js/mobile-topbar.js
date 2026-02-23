export function initMobileTopbar() {
  const toggleBtn = document.getElementById('menuToggle');
  const overlay = document.getElementById('mobileOverlay');
  const drawer = document.getElementById('mobileDrawer');
  if (!toggleBtn || !overlay || !drawer) return;

  let lastFocusedEl = null;

  const setExpanded = (isExpanded) => {
    toggleBtn.setAttribute('aria-expanded', String(isExpanded));
  };

  const closeMenu = () => {
    document.body.classList.remove('menu-open');
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    setExpanded(false);
    if (lastFocusedEl) lastFocusedEl.focus();
  };

  const openMenu = () => {
    lastFocusedEl = document.activeElement;
    document.body.classList.add('menu-open');
    overlay.classList.add('open');
    drawer.classList.add('open');
    setExpanded(true);

    const firstFocusable = drawer.querySelector('a, button');
    if (firstFocusable) firstFocusable.focus();
  };

  toggleBtn.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('open');
    if (isOpen) closeMenu();
    else openMenu();
  });

  overlay.addEventListener('click', closeMenu);

  drawer.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('a, button')) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 640 && drawer.classList.contains('open')) closeMenu();
  });

  setExpanded(false);
}
