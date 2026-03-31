import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

let _clientPromise;
const DEV_AUTH_QUERY_KEY = 'devAuth';
const DEV_AUTH_QUERY_VALUE = '1';
const DEV_AUTH_USER = Object.freeze({
  id: 'dev-user',
  email: 'dev@example.local'
});

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function isLocalDevHost() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function currentUrl() {
  return new URL(window.location.href);
}

export function isDevAuthEnabled() {
  if (!isLocalDevHost()) return false;
  const url = currentUrl();
  return url.searchParams.get(DEV_AUTH_QUERY_KEY) === DEV_AUTH_QUERY_VALUE;
}

export function getDevAuthUser() {
  return isDevAuthEnabled() ? DEV_AUTH_USER : null;
}

function getAuthRedirectUrl() {
  return new URL('auth.html', window.location.href).toString();
}

async function loadCreateClient() {
  const mod = await import('https://esm.sh/@supabase/supabase-js@2');
  return mod.createClient;
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (_clientPromise) return _clientPromise;

  _clientPromise = (async () => {
    const createClient = await loadCreateClient();
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  })();

  return _clientPromise;
}

export async function getSessionUser() {
  const devUser = getDevAuthUser();
  if (devUser) return devUser;
  const supabase = await getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function sendEmailOtp(email) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase configuration is missing.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // OTP入力方式ではリダイレクト不要だが、フォールバックで保持
      emailRedirectTo: getAuthRedirectUrl(),
      // 登録済みユーザーのみログインを許可（新規自動作成を禁止）
      shouldCreateUser: false
    }
  });
  if (error) throw error;
}

export async function verifyEmailOtp(email, token) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase configuration is missing.');
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email'
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (isDevAuthEnabled()) return;
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function readAuthUrlError() {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const msg = params.get('error_description');
  return msg ? decodeURIComponent(msg.replace(/\+/g, ' ')) : '';
}

export function getReturnToParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get('returnTo') || '';
}

export function buildAuthUrl(returnToPath = '') {
  const url = new URL('auth.html', window.location.href);
  if (returnToPath) url.searchParams.set('returnTo', returnToPath);
  if (isDevAuthEnabled()) {
    url.searchParams.set(DEV_AUTH_QUERY_KEY, DEV_AUTH_QUERY_VALUE);
  }
  return url.toString();
}
