import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

let _clientPromise;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
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
  const supabase = await getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function signInWithMagicLink(email) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase configuration is missing.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      // 登録済みユーザーのみログインを許可（新規自動作成を禁止）
      shouldCreateUser: false
    }
  });
  if (error) throw error;
}

export async function signOut() {
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
  return url.toString();
}
