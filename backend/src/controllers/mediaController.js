import { getStorage } from "firebase-admin/storage";

const storage = getStorage();

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
