import { apiRequest } from "./apiClient";

const fileToBase64 = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

export const uploadMedia = async ({ uid, folder, file }) => {
  const dataBase64 = await fileToBase64(file);

  return apiRequest("/api/media/upload", {
    method: "POST",
    body: JSON.stringify({
      uid,
      folder,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      dataBase64,
    }),
  });
};
