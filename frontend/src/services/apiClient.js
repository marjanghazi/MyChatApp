const DEFAULT_TIMEOUT_MS = 15_000;
const LOCAL_BACKEND_ORIGIN = "http://localhost:4000";

const sanitizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
};

const API_BASE_URL = sanitizeBaseUrl(process.env.REACT_APP_API_BASE_URL);

const normalizePath = (path) => (path.startsWith("/") ? path : `/${path}`);

const joinUrl = (baseUrl, path) => {
  const normalizedPath = normalizePath(path);

  if (!baseUrl) return normalizedPath;

  // Prevent accidental duplicate /api prefix when env uses .../api
  // and service paths already start with /api/...
  if (baseUrl.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${baseUrl}${normalizedPath.slice(4)}`;
  }

  return `${baseUrl}${normalizedPath}`;
};

const buildPrimaryUrl = (path) => joinUrl(API_BASE_URL, path);
const buildLocalFallbackUrl = (path) => joinUrl(LOCAL_BACKEND_ORIGIN, path);

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

const requestOnce = async (url, options) => {
  try {
    return await withTimeout(url, options);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s.`);
    }
    throw error;
  }
};

export const apiRequest = async (path, options = {}) => {
  const requestOptions = {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  };

  let response;

  try {
    const primaryUrl = buildPrimaryUrl(path);
    response = await requestOnce(primaryUrl, requestOptions);

    // If no explicit base URL is configured, a 404 can indicate the frontend host
    // handled `/api/*` instead of backend. Retry once against local backend origin.
    if (response.status === 404 && !API_BASE_URL) {
      const fallbackUrl = buildLocalFallbackUrl(path);
      response = await requestOnce(fallbackUrl, requestOptions);
    }
  } catch (error) {
    if (error.message?.startsWith("Request timed out")) {
      throw error;
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
    const message = body?.message || `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return body;
};
