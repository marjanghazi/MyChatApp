import { Router } from "express";
import { login, register, updateAuthProfile } from "../controllers/authController.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/update-profile", updateAuthProfile);

export default router;
