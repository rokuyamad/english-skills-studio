const CHIP_ACTIVE_CLASS = 'is-count-bumping';
const BUTTON_ACTIVE_CLASS = 'is-count-firing';
const FLOAT_CLASS = 'count-float';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function restartClassAnimation(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function clearClassLater(element, className, delay) {
  if (!element) return;
  window.setTimeout(() => {
    element.classList.remove(className);
  }, delay);
}

export function playCountFeedback({ wrapEl, chipEl, buttonEl, label = '+1' }) {
  restartClassAnimation(chipEl, CHIP_ACTIVE_CLASS);
  restartClassAnimation(buttonEl, BUTTON_ACTIVE_CLASS);
  clearClassLater(chipEl, CHIP_ACTIVE_CLASS, prefersReducedMotion() ? 160 : 420);
  clearClassLater(buttonEl, BUTTON_ACTIVE_CLASS, prefersReducedMotion() ? 160 : 300);

  if (!wrapEl) return;

  const floatEl = document.createElement('span');
  floatEl.className = FLOAT_CLASS;
  floatEl.textContent = label;
  if (prefersReducedMotion()) {
    floatEl.classList.add(`${FLOAT_CLASS}--reduced`);
  }
  wrapEl.appendChild(floatEl);

  const remove = () => {
    floatEl.removeEventListener('animationend', remove);
    if (floatEl.isConnected) {
      floatEl.remove();
    }
  };

  floatEl.addEventListener('animationend', remove, { once: true });
  window.setTimeout(remove, prefersReducedMotion() ? 220 : 900);
}
