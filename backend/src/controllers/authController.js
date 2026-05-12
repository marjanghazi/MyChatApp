const required = (value, name) => {
  if (!value || (typeof value === "string" && !value.trim())) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    throw error;
  }
};

const getFirebaseWebApiKey = () =>
  process.env.FIREBASE_WEB_API_KEY ||
  process.env.FIREBASE_API_KEY ||
  process.env.REACT_APP_FIREBASE_API_KEY ||
  "";

const authRequest = async (path, payload) => {
  const apiKey = getFirebaseWebApiKey();

  if (!apiKey) {
    const error = new Error(
      "Firebase Web API key is missing. Set FIREBASE_WEB_API_KEY (preferred) in backend/.env, or FIREBASE_API_KEY, or REACT_APP_FIREBASE_API_KEY."
    );
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || "Authentication request failed.";
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }

  return data;
};

const toUser = (data) => ({
  uid: data.localId,
  email: data.email,
  displayName: data.displayName || "",
  photoURL: data.photoUrl || "",
  idToken: data.idToken,
  refreshToken: data.refreshToken,
});

export const register = async (req, res, next) => {
  try {
    const { email, password, displayName = "" } = req.body;
    required(email, "email");
    required(password, "password");

    const data = await authRequest("accounts:signUp", {
      email,
      password,
      returnSecureToken: true,
    });

    let final = data;
    if (displayName.trim()) {
      final = await authRequest("accounts:update", {
        idToken: data.idToken,
        displayName: displayName.trim(),
        returnSecureToken: true,
      });
    }

    res.status(201).json({ user: toUser(final) });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    required(email, "email");
    required(password, "password");

    const data = await authRequest("accounts:signInWithPassword", {
      email,
      password,
      returnSecureToken: true,
    });

    res.json({ user: toUser(data) });
  } catch (error) {
    next(error);
  }
};

export const updateAuthProfile = async (req, res, next) => {
  try {
    const { idToken, displayName = "", photoURL = "" } = req.body;
    required(idToken, "idToken");

    const data = await authRequest("accounts:update", {
      idToken,
      displayName,
      photoUrl: photoURL,
      returnSecureToken: true,
    });

    res.json({ user: toUser(data) });
  } catch (error) {
    next(error);
  }
};
