const DEFAULT_API_BASE_URL = "http://localhost:4000";

const sanitizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return DEFAULT_API_BASE_URL;
  return value.trim().replace(/\/+$/, "") || DEFAULT_API_BASE_URL;
};

const API_BASE_URL = sanitizeBaseUrl(process.env.REACT_APP_API_BASE_URL);

const buildUrl = (path) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

const withTimeout = async (url, options = {}, timeoutMs = 15_000) => {
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

const humanizeNetworkError = (error) => {
  if (error?.name === "AbortError") {
    return `Request timed out while calling ${API_BASE_URL}.`;
  }

  return `Unable to reach backend at ${API_BASE_URL}. Check backend server, CORS_ORIGINS, and REACT_APP_API_BASE_URL.`;
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
    throw new Error(humanizeNetworkError(error));
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
