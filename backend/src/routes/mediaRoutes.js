import { Router } from "express";
import { deleteMediaByPath, uploadMedia, uploadMediaByPath } from "../controllers/mediaController.js";

const router = Router();

router.post("/upload", uploadMedia);
router.post("/upload-by-path", uploadMediaByPath);
router.post("/delete-by-path", deleteMediaByPath);

export default router;
