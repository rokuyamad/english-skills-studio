import {
  getReturnToParam,
  getSessionUser,
  isSupabaseConfigured,
  readAuthUrlError,
  signInWithMagicLink,
  signOut
} from './auth.js';

const form = document.getElementById('magicLinkForm');
const emailInput = document.getElementById('emailInput');
const statusEl = document.getElementById('statusText');
const signedInEl = document.getElementById('signedInBlock');
const signedOutEl = document.getElementById('signedOutBlock');
const currentUserEl = document.getElementById('currentUser');
const logoutBtn = document.getElementById('logoutBtn');

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

function renderSignedIn(email) {
  signedInEl.classList.remove('hidden');
  signedOutEl.classList.add('hidden');
  currentUserEl.textContent = email || 'ログイン済み';
}

function renderSignedOut() {
  signedInEl.classList.add('hidden');
  signedOutEl.classList.remove('hidden');
}

function tryRedirectToReturnTo() {
  const returnTo = getReturnToParam();
  if (!returnTo) return false;
  // 外部URLへのオープンリダイレクトを避ける
  if (!returnTo.startsWith('/')) return false;
  window.location.href = returnTo;
  return true;
}

async function initialize() {
  if (!isSupabaseConfigured()) {
    setStatus('Supabase未設定です。js/supabase-config.js を編集してください。', true);
    renderSignedOut();
    return;
  }

  const authUrlError = readAuthUrlError();
  if (authUrlError) setStatus(`認証エラー: ${authUrlError}`, true);

  try {
    const user = await getSessionUser();
    if (user) {
      renderSignedIn(user.email);
      setStatus('ログイン済みです。');
      tryRedirectToReturnTo();
    } else {
      renderSignedOut();
      setStatus('メールアドレスを入力して Magic Link を送信してください。');
    }
  } catch (e) {
    console.error(e);
    setStatus(`認証状態の取得に失敗しました: ${e.message}`, true);
    renderSignedOut();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isSupabaseConfigured()) return;
  const email = emailInput.value.trim();
  if (!email) {
    setStatus('メールアドレスを入力してください。', true);
    return;
  }

  setStatus('Magic Link を送信中...');
  try {
    await signInWithMagicLink(email);
    setStatus('送信しました。メールのリンクを開いてログインしてください。');
  } catch (err) {
    console.error(err);
    setStatus(`送信失敗: ${err.message}`, true);
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await signOut();
    renderSignedOut();
    setStatus('ログアウトしました。');
  } catch (e) {
    console.error(e);
    setStatus(`ログアウト失敗: ${e.message}`, true);
  }
});

initialize();
