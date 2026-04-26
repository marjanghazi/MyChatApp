import { Router } from "express";
import {
  deleteForEveryone,
  deleteForMe,
  editMessage,
  sendMessage,
  toggleMessageFlag,
} from "../controllers/chatController.js";

const router = Router();

router.post("/messages/send", sendMessage);
router.patch("/messages/edit", editMessage);
router.patch("/messages/delete-for-me", deleteForMe);
router.patch("/messages/delete-for-everyone", deleteForEveryone);
router.patch("/messages/toggle-flag", toggleMessageFlag);

export default router;
