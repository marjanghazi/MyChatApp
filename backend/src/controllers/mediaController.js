import { getStorage } from "firebase-admin/storage";

const storage = getStorage();

const STORAGE_PATH_RULES = [
  /^attachments\/[A-Za-z0-9_-]+\/.+$/,
  /^avatars\/[A-Za-z0-9_-]+\/.+$/,
  /^logos\/[A-Za-z0-9_-]+\/.+$/,
  /^direct\/[A-Za-z0-9_-]+\/.+$/,
  /^group\/[A-Za-z0-9_-]+\/.+$/,
  /^channel\/[A-Za-z0-9_-]+\/.+$/,
  /^group-attachments\/[A-Za-z0-9_-]+\/.+$/,
  /^channel-attachments\/[A-Za-z0-9_-]+\/.+$/,
];

const assertAllowedStoragePath = (storagePath) => {
  if (!STORAGE_PATH_RULES.some((rule) => rule.test(storagePath))) {
    const error = new Error(`storagePath not allowed: ${storagePath}`);
    error.statusCode = 403;
    throw error;
  }
};

const must = (value, name) => {
  if (!value || (typeof value === "string" && !value.trim())) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    throw error;
  }
};

export const uploadMedia = async (req, res, next) => {
  try {
    const { uid, folder, fileName, contentType, dataBase64 } = req.body;
    must(uid, "uid");
    must(folder, "folder");
    must(fileName, "fileName");
    must(contentType, "contentType");
    must(dataBase64, "dataBase64");

    const bucket = storage.bucket();
    const safeName = `${Date.now()}_${fileName}`;
    const filePath = `${folder}/${uid}/${safeName}`;
    assertAllowedStoragePath(filePath);
    const file = bucket.file(filePath);

    const buffer = Buffer.from(dataBase64, "base64");
    await file.save(buffer, {
      metadata: { contentType },
      resumable: false,
    });

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });

    res.json({ ok: true, url, path: filePath });
  } catch (error) {
    next(error);
  }
};


export const uploadMediaByPath = async (req, res, next) => {
  try {
    const { storagePath, contentType, dataBase64 } = req.body;
    must(storagePath, "storagePath");
    must(contentType, "contentType");
    must(dataBase64, "dataBase64");

    const bucket = storage.bucket();
    assertAllowedStoragePath(storagePath);
    const file = bucket.file(storagePath);

    const buffer = Buffer.from(dataBase64, "base64");
    await file.save(buffer, {
      metadata: { contentType },
      resumable: false,
    });

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });

    res.json({ ok: true, url, path: storagePath });
  } catch (error) {
    next(error);
  }
};

export const deleteMediaByPath = async (req, res, next) => {
  try {
    const { storagePath } = req.body;
    must(storagePath, "storagePath");
    assertAllowedStoragePath(storagePath);

    await storage.bucket().file(storagePath).delete({ ignoreNotFound: true });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
