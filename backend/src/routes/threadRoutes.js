import { Router } from "express";
import {
  listChannels,
  listConversationsByUid,
  listGroupsByUid,
  listUsers,
  markConversationDelivered,
} from "../controllers/threadController.js";

const router = Router();

router.get("/users", listUsers);
router.get("/conversations", listConversationsByUid);
router.patch("/conversations/:conversationId/delivered", markConversationDelivered);
router.get("/groups", listGroupsByUid);
router.get("/channels", listChannels);

export default router;
