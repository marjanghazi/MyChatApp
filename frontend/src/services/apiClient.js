const DEFAULT_TIMEOUT_MS = 15_000;

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

const responseMessage = (body, response, path, method) => {
  const serverMessage = body?.message || body?.detail;
  if (serverMessage && serverMessage !== "Not Found") return serverMessage;

  if (response.status === 404) {
    return `Backend API route not found: ${method} ${normalizePath(path)}. Make sure the Python backend is running and up to date.`;
  }

  return `Request failed (${response.status}).`;
};

export const apiRequest = async (path, options = {}) => {
  const token = JSON.parse(localStorage.getItem('pqc_auth_user') || 'null')?.idToken;
  const requestOptions = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  };

  let response;

  try {
    const primaryUrl = buildPrimaryUrl(path);
    response = await requestOnce(primaryUrl, requestOptions);

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
    const method = String(requestOptions.method || "GET").toUpperCase();
    const message = responseMessage(body, response, path, method);
    throw new Error(message);
  }

  return body;
};
