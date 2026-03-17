import {
  buildAuthUrl,
  getSessionUser,
  isSupabaseConfigured,
  signOut
} from './auth.js';
import { fetchDueCount } from './srs-api.js';

const TOPBAR_DUE_BADGE_MAX = 20;

function renderLoggedOut(slot) {
  const { userEl, linkEl, logoutBtn } = slot;
  userEl.textContent = '未ログイン';
  linkEl.textContent = 'ログイン';
  linkEl.classList.remove('hidden');
  logoutBtn.classList.add('hidden');
}

function renderLoggedIn(slot, email) {
  const { userEl, linkEl, logoutBtn } = slot;
  const isDesktopTopbarUser = userEl.id === 'authUser';
  userEl.textContent = isDesktopTopbarUser ? 'ログイン済み' : (email || 'ログイン済み');
  linkEl.classList.add('hidden');
  logoutBtn.classList.remove('hidden');
}

function bindLogoutButton(btn, onLogout) {
  if (btn.dataset.bound === 'true') return;
  btn.dataset.bound = 'true';
  btn.addEventListener('click', onLogout);
}

function getDueSlots() {
  const desktop = document.getElementById('dueLink');
  const mobile = document.getElementById('mobileDueLink');
  return [desktop, mobile].filter(Boolean);
}

function hideDueSlots() {
  getDueSlots().forEach((el) => {
    el.classList.add('hidden');
    el.textContent = '復習 0件';
  });
}

export async function refreshDueBadge() {
  const slots = getDueSlots();
  if (!slots.length) return;
  if (!isSupabaseConfigured()) {
    hideDueSlots();
    return;
  }

  try {
    const count = await fetchDueCount({ cardType: 'all' });
    const displayCount = Math.min(count, TOPBAR_DUE_BADGE_MAX);
    slots.forEach((el) => {
      if (displayCount > 0) {
        el.textContent = `復習 ${displayCount}件`;
        el.classList.remove('hidden');
      } else {
        el.textContent = '復習 0件';
        el.classList.add('hidden');
      }
    });
  } catch (error) {
    console.warn('[auth-ui] due badge skipped', error);
    hideDueSlots();
  }
}

export async function setupTopbarAuth() {
  const desktop = {
    userEl: document.getElementById('authUser'),
    linkEl: document.getElementById('authLink'),
    logoutBtn: document.getElementById('logoutBtn')
  };
  const mobile = {
    userEl: document.getElementById('mobileAuthUser'),
    linkEl: document.getElementById('mobileAuthLink'),
    logoutBtn: document.getElementById('mobileLogoutBtn')
  };
  const slots = [desktop, mobile].filter(
    (slot) => slot.userEl && slot.linkEl && slot.logoutBtn
  );
  if (!slots.length) return;

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const authUrl = buildAuthUrl(returnTo);
  slots.forEach((slot) => {
    slot.linkEl.href = authUrl;
  });

  if (!isSupabaseConfigured()) {
    hideDueSlots();
    slots.forEach((slot) => {
      slot.userEl.textContent = 'Auth未設定';
      slot.linkEl.textContent = '設定方法';
      slot.linkEl.classList.remove('hidden');
      slot.logoutBtn.classList.add('hidden');
    });
    return;
  }

  try {
    const user = await getSessionUser();
    if (user) {
      slots.forEach((slot) => renderLoggedIn(slot, user.email));
      await refreshDueBadge();
    } else {
      slots.forEach((slot) => renderLoggedOut(slot));
      hideDueSlots();
    }
  } catch (e) {
    console.error(e);
    hideDueSlots();
    slots.forEach((slot) => {
      slot.userEl.textContent = '認証エラー';
      slot.linkEl.classList.remove('hidden');
      slot.logoutBtn.classList.add('hidden');
    });
  }

  const onLogout = async () => {
    try {
      await signOut();
      slots.forEach((slot) => renderLoggedOut(slot));
      hideDueSlots();
      window.location.href = 'auth.html';
    } catch (e) {
      console.error(e);
      slots.forEach((slot) => {
        slot.userEl.textContent = 'ログアウト失敗';
      });
    }
  };

  slots.forEach((slot) => bindLogoutButton(slot.logoutBtn, onLogout));
}

export async function requireAuthOrRedirect() {
  if (!isSupabaseConfigured()) {
    window.location.href = buildAuthUrl(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
    return false;
  }

  try {
    const user = await getSessionUser();
    if (user) return true;
    window.location.href = buildAuthUrl(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
    return false;
  } catch (e) {
    console.error(e);
    window.location.href = buildAuthUrl(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
    return false;
  }
}
