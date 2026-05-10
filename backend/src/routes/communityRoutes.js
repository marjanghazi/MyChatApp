import { Router } from "express";
import {
  addGroupMember,
  createChannel,
  createGroup,
  followChannel,
  leaveGroup,
  removeGroupMember,
  toggleGroupAdmin,
  unfollowChannel,
} from "../controllers/communityController.js";

const router = Router();

router.post("/groups", createGroup);
router.post("/groups/:groupId/leave", leaveGroup);
router.post("/groups/:groupId/members/add", addGroupMember);
router.post("/groups/:groupId/members/remove", removeGroupMember);
router.post("/groups/:groupId/admins/toggle", toggleGroupAdmin);

router.post("/channels", createChannel);
router.post("/channels/:channelId/follow", followChannel);
router.post("/channels/:channelId/unfollow", unfollowChannel);

export default router;
