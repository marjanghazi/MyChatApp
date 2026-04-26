const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";

const buildUrl = (path) => `${API_BASE_URL}${path}`;

export const apiRequest = async (path, options = {}) => {
  const response = await fetch(buildUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

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
