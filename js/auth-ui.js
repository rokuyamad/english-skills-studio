import {
  buildAuthUrl,
  getSessionUser,
  isSupabaseConfigured,
  signOut
} from './auth.js';

function renderLoggedOut(userEl, linkEl, logoutBtn) {
  userEl.textContent = '未ログイン';
  linkEl.classList.remove('hidden');
  logoutBtn.classList.add('hidden');
}

function renderLoggedIn(userEl, linkEl, logoutBtn, email) {
  userEl.textContent = email || 'ログイン済み';
  linkEl.classList.add('hidden');
  logoutBtn.classList.remove('hidden');
}

export async function setupTopbarAuth() {
  const userEl = document.getElementById('authUser');
  const linkEl = document.getElementById('authLink');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!userEl || !linkEl || !logoutBtn) return;

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  linkEl.href = buildAuthUrl(returnTo);

  if (!isSupabaseConfigured()) {
    userEl.textContent = 'Auth未設定';
    linkEl.textContent = '設定方法';
    logoutBtn.classList.add('hidden');
    return;
  }

  try {
    const user = await getSessionUser();
    if (user) renderLoggedIn(userEl, linkEl, logoutBtn, user.email);
    else renderLoggedOut(userEl, linkEl, logoutBtn);
  } catch (e) {
    console.error(e);
    userEl.textContent = '認証エラー';
    linkEl.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
  }

  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut();
      renderLoggedOut(userEl, linkEl, logoutBtn);
      window.location.href = 'auth.html';
    } catch (e) {
      console.error(e);
      userEl.textContent = 'ログアウト失敗';
    }
  });
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
