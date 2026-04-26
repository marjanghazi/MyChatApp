import { Router } from "express";
import {
  createChannel,
  createGroup,
  followChannel,
  unfollowChannel,
} from "../controllers/communityController.js";

const router = Router();

router.post("/groups", createGroup);
router.post("/channels", createChannel);
router.post("/channels/:channelId/follow", followChannel);
router.post("/channels/:channelId/unfollow", unfollowChannel);

export default router;
