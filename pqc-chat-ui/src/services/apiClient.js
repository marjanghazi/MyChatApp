const DEFAULT_TIMEOUT_MS = 15_000;

const sanitizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
};

const API_BASE_URL = sanitizeBaseUrl(process.env.REACT_APP_API_BASE_URL);

const buildUrl = (path) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

const withTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const backendHint = () => {
  if (API_BASE_URL) {
    return `Unable to reach backend at ${API_BASE_URL}. Check backend server, CORS_ORIGINS, and REACT_APP_API_BASE_URL.`;
  }

  return "Unable to reach backend API. Start backend (port 4000) and use frontend dev proxy or set REACT_APP_API_BASE_URL.";
};

export const apiRequest = async (path, options = {}) => {
  let response;

  try {
    response = await withTimeout(buildUrl(path), {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s.`);
    }

    throw new Error(backendHint());
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return body;
};
