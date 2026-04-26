const SESSION_KEY = "crm-v2-supabase-session";
const AUTH_REFRESH_BUFFER_SECONDS = 300;
const NETWORK_RETRY_DELAY_MS = 350;
const FETCH_TIMEOUT_MS = 15000;

export const getSupabaseConfig = () => ({
  url: import.meta.env?.VITE_SUPABASE_URL || "",
  anonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY || "",
});

export const isSupabaseConfigured = () => {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
};

export const getSupabaseModeLabel = () => isSupabaseConfigured() ? "supabase" : "local";

export const getStoredSession = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const storeSession = (session) => {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const isSessionExpired = (session) => {
  if (!session?.expires_at) return false;
  const now = Math.floor(Date.now() / 1000);
  return now >= (session.expires_at - AUTH_REFRESH_BUFFER_SECONDS);
};

const withHeaders = (token, extra = {}) => {
  const { anonKey } = getSupabaseConfig();
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
    ...extra,
  };
};

const parseResponseBody = async (res) => {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const getAuthErrorMessage = (data, fallback) => (
  data?.msg ||
  data?.message ||
  data?.error_description ||
  data?.error ||
  fallback
);

const isInvalidRefreshTokenMessage = (message = "") => {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("invalid refresh token")
    || normalized.includes("refresh token not found")
    || normalized.includes("refresh_token_not_found")
    || normalized.includes("invalid grant");
};

const isRetriableNetworkError = (error) => {
  const message = `${error?.message || error || ""}`.toLowerCase();
  return message.includes("load failed")
    || message.includes("failed to fetch")
    || message.includes("networkerror")
    || message.includes("timed out")
    || message.includes("timeout");
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (input, init = {}) => {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Supabase request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timerId);
  }
};

const fetchWithRetry = async (input, init, attempts = 3) => {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await fetchWithTimeout(input, init);
    } catch (error) {
      lastError = error;
      if (!isRetriableNetworkError(error) || index === attempts - 1) {
        throw error;
      }
      await sleep(NETWORK_RETRY_DELAY_MS);
    }
  }
  throw lastError || new Error("Ошибка сети");
};

export const refreshSession = async (sessionOverride = null) => {
  const { url } = getSupabaseConfig();
  const session = sessionOverride || getStoredSession();
  if (!session?.refresh_token) {
    throw new Error("Сессия истекла. Войди снова.");
  }

  const res = await fetchWithRetry(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: withHeaders(null, { "Content-Type": "application/json" }),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const data = await parseResponseBody(res);
  if (!res.ok) {
    storeSession(null);
    const message = getAuthErrorMessage(data, "Сессия истекла. Войди снова.");
    throw new Error(isInvalidRefreshTokenMessage(message) ? "Сессия истекла. Войди снова." : message);
  }
  storeSession(data);
  return data;
};

export const ensureSession = async (sessionOverride = null) => {
  const session = sessionOverride || getStoredSession();
  if (!session?.access_token) return null;
  if (!isSessionExpired(session)) return session;
  return refreshSession(session);
};

export const signInWithPassword = async ({ email, password }) => {
  const { url } = getSupabaseConfig();
  const res = await fetchWithRetry(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: withHeaders(null, { "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  });
  const data = await parseResponseBody(res);
  if (!res.ok) throw new Error(getAuthErrorMessage(data, "Не удалось войти"));
  storeSession(data);
  return data;
};

export const signOut = async () => {
  const { url } = getSupabaseConfig();
  const session = getStoredSession();
  if (session?.access_token) {
    await fetchWithRetry(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: withHeaders(session.access_token),
    }).catch(() => {});
  }
  storeSession(null);
};

const buildQuery = (filters = {}) => Object.entries(filters)
  .filter(([, value]) => value !== undefined && value !== null)
  .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  .join("&");

const isJwtExpiredError = (res, data) => {
  const message = `${data?.message || data?.error_description || data?.error || ""}`.toLowerCase();
  return res.status === 401 || message.includes("jwt expired") || message.includes("invalid jwt");
};

const authorizedRest = async (path, { method = "GET", token, headers = {}, body } = {}) => {
  const { url } = getSupabaseConfig();
  let session = await ensureSession(getStoredSession());
  let activeToken = session?.access_token || token || null;

  const perform = async (bearerToken) => {
    const res = await fetchWithRetry(`${url}${path}`, {
      method,
      headers: withHeaders(bearerToken, headers),
      body,
    });
    const data = await parseResponseBody(res);
    return { res, data };
  };

  let { res, data } = await perform(activeToken);
  if (!res.ok && isJwtExpiredError(res, data)) {
    session = await refreshSession(session || getStoredSession());
    activeToken = session?.access_token || token || null;
    ({ res, data } = await perform(activeToken));
  }

  if (!res.ok) {
    throw new Error(getAuthErrorMessage(data, `Ошибка запроса ${path}`));
  }

  return data;
};

const withNetworkFriendlyError = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    if (isRetriableNetworkError(error)) {
      throw new Error("Ошибка связи с базой. Попробуй ещё раз.");
    }
    throw error;
  }
};

export const restSelect = async (table, { select = "*", filters = {}, token, single = false } = {}) => {
  const query = buildQuery({ select, ...filters });
  return withNetworkFriendlyError(() => authorizedRest(`/rest/v1/${table}?${query}`, {
    token,
    headers: single ? { Accept: "application/vnd.pgrst.object+json" } : {},
  }));
};

export const restInsert = async (table, payload, { token } = {}) => {
  return withNetworkFriendlyError(() => authorizedRest(`/rest/v1/${table}`, {
    method: "POST",
    token,
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
  }));
};

export const restUpsert = async (table, payload, { token, onConflict } = {}) => {
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  return withNetworkFriendlyError(() => authorizedRest(`/rest/v1/${table}${suffix}`, {
    method: "POST",
    token,
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
  }));
};

export const restPatch = async (table, payload, { token, filters = {} } = {}) => {
  const query = buildQuery(filters);
  return withNetworkFriendlyError(() => authorizedRest(`/rest/v1/${table}?${query}`, {
    method: "PATCH",
    token,
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  }));
};

export const restDelete = async (table, { token, filters = {} } = {}) => {
  const query = buildQuery(filters);
  return withNetworkFriendlyError(() => authorizedRest(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    token,
    headers: { Prefer: "return=representation" },
  }));
};

export const restRpc = async (fn, { token, body = {} } = {}) => {
  return withNetworkFriendlyError(() => authorizedRest(`/rest/v1/rpc/${fn}`, {
    method: "POST",
    token,
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  }));
};

export const invokeFunction = async (name, { body = {}, method = "POST" } = {}) => {
  return withNetworkFriendlyError(async () => {
    const { url } = getSupabaseConfig();
    let session = await ensureSession(getStoredSession());
    let activeToken = session?.access_token || null;

    const perform = async (bearerToken) => {
      const res = await fetchWithRetry(`${url}/functions/v1/${name}`, {
        method,
        headers: withHeaders(bearerToken, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(body),
      });
      const data = await parseResponseBody(res);
      return { res, data };
    };

    let { res, data } = await perform(activeToken);
    if (!res.ok && isJwtExpiredError(res, data)) {
      session = await refreshSession(session || getStoredSession());
      activeToken = session?.access_token || null;
      ({ res, data } = await perform(activeToken));
    }

    if (!res.ok) {
      throw new Error(getAuthErrorMessage(data, `Ошибка вызова функции ${name}`));
    }

    return data;
  });
};
