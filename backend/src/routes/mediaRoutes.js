import { Router } from "express";
import { uploadMedia } from "../controllers/mediaController.js";

const router = Router();

router.post("/upload", uploadMedia);

export default router;
