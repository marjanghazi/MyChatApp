import { Router } from "express";
import {
  addContactByPhone,
  checkPhoneAvailability,
  getUserProfile,
  setPresence,
  updateUserProfile,
  upsertUserProfile,
} from "../controllers/userController.js";

const router = Router();

router.post("/check-phone", checkPhoneAvailability);
router.post("/profile", upsertUserProfile);
router.get("/:uid/profile", getUserProfile);
router.post("/:uid/presence", setPresence);
router.patch("/:uid/profile", updateUserProfile);
router.post("/:uid/contacts", addContactByPhone);

export default router;
