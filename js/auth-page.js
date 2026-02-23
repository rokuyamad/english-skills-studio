import {
  getReturnToParam,
  getSessionUser,
  isSupabaseConfigured,
  readAuthUrlError,
  sendEmailOtp,
  verifyEmailOtp,
  signOut
} from './auth.js';
import { initMobileTopbar } from './mobile-topbar.js';

const requestForm = document.getElementById('requestOtpForm');
const verifyForm = document.getElementById('verifyOtpForm');
const emailInput = document.getElementById('emailInput');
const otpInput = document.getElementById('otpInput');
const statusEl = document.getElementById('statusText');
const signedInEl = document.getElementById('signedInBlock');
const signedOutEl = document.getElementById('signedOutBlock');
const otpBlock = document.getElementById('otpBlock');
const currentUserEl = document.getElementById('currentUser');
const logoutBtn = document.getElementById('logoutBtn');

let pendingEmail = '';

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
  otpBlock.classList.add('hidden');
  otpInput.value = '';
  pendingEmail = '';
}

function ensureCustomValidationFlow() {
  // ブラウザ既定メッセージではなく、画面内ステータスに統一する
  requestForm.setAttribute('novalidate', 'novalidate');
  verifyForm.setAttribute('novalidate', 'novalidate');
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
      setStatus('メールアドレスに6桁コードを送信してログインしてください。');
    }
  } catch (e) {
    console.error(e);
    setStatus(`認証状態の取得に失敗しました: ${e.message}`, true);
    renderSignedOut();
  }
}

requestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isSupabaseConfigured()) return;
  const email = emailInput.value.trim();
  if (!email) {
    setStatus('メールアドレスを入力してください。', true);
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setStatus('メールアドレスの形式が正しくありません。', true);
    return;
  }

  setStatus('認証コードを送信中...');
  try {
    await sendEmailOtp(email);
    pendingEmail = email;
    otpBlock.classList.remove('hidden');
    setStatus('送信しました。メールの6桁コードを入力してください。');
  } catch (err) {
    console.error(err);
    setStatus(`送信失敗: ${err.message}`, true);
  }
});

verifyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isSupabaseConfigured()) return;
  const token = otpInput.value.trim();
  const email = pendingEmail || emailInput.value.trim();
  if (!email) {
    setStatus('先にメールアドレスを入力してください。', true);
    return;
  }
  if (!/^\d{6}$/.test(token)) {
    setStatus('6桁の数字コードを入力してください。', true);
    return;
  }

  setStatus('コードを検証中...');
  try {
    await verifyEmailOtp(email, token);
    const user = await getSessionUser();
    renderSignedIn(user?.email || email);
    setStatus('ログインしました。');
    tryRedirectToReturnTo();
  } catch (err) {
    console.error(err);
    setStatus(`認証失敗: ${err.message}`, true);
  }
});

otpInput.addEventListener('input', () => {
  if (otpInput.value.length > 6) otpInput.value = otpInput.value.slice(0, 6);
  if (otpInput.value && !/^\d+$/.test(otpInput.value)) {
    setStatus('認証コードは数字のみ入力できます。', true);
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
ensureCustomValidationFlow();
initMobileTopbar();
