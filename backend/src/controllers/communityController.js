import { FieldValue } from "firebase-admin/firestore";
import { getFirestore } from "../config/firebaseAdmin.js";

const db = getFirestore();

const groupsCollection = () => db.collection("groups");
const channelsCollection = () => db.collection("channels");

const must = (value, name) => {
  if (!value || (typeof value === "string" && !value.trim())) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    throw error;
  }
};

export const createGroup = async (req, res, next) => {
  try {
    const { name, description = "", memberIds = [], creatorId } = req.body;

    must(name, "name");
    must(creatorId, "creatorId");

    const members = Array.from(new Set([creatorId, ...memberIds]));
    const now = new Date();

    const payload = {
      name: name.trim(),
      description: description.trim(),
      memberIds: members,
      admins: [creatorId],
      createdBy: creatorId,
      createdAt: now,
      updatedAt: now,
      lastMessage: "",
      lastMessageAt: null,
    };

    const docRef = await groupsCollection().add(payload);
    res.status(201).json({ id: docRef.id, ...payload });
  } catch (error) {
    next(error);
  }
};

export const createChannel = async (req, res, next) => {
  try {
    const { name, description = "", creatorId } = req.body;

    must(name, "name");
    must(creatorId, "creatorId");

    const now = new Date();

    const payload = {
      name: name.trim(),
      description: description.trim(),
      ownerId: creatorId,
      followerIds: [creatorId],
      createdAt: now,
      updatedAt: now,
      lastPost: "",
      lastPostAt: null,
    };

    const docRef = await channelsCollection().add(payload);
    res.status(201).json({ id: docRef.id, ...payload });
  } catch (error) {
    next(error);
  }
};

export const followChannel = async (req, res, next) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.body;

    must(channelId, "channelId");
    must(userId, "userId");

    const docRef = channelsCollection().doc(channelId);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists) {
        const error = new Error("Channel not found");
        error.statusCode = 404;
        throw error;
      }

      const data = snapshot.data();
      const existing = Array.isArray(data.followerIds) ? data.followerIds : [];

      if (!existing.includes(userId)) {
        existing.push(userId);
      }

      transaction.update(docRef, {
        followerIds: existing,
        updatedAt: new Date(),
      });
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const unfollowChannel = async (req, res, next) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.body;

    must(channelId, "channelId");
    must(userId, "userId");

    const docRef = channelsCollection().doc(channelId);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists) {
        const error = new Error("Channel not found");
        error.statusCode = 404;
        throw error;
      }

      const data = snapshot.data();
      const existing = Array.isArray(data.followerIds) ? data.followerIds : [];
      const nextFollowers = existing.filter((id) => id !== userId);

      transaction.update(docRef, {
        followerIds: nextFollowers,
        updatedAt: new Date(),
      });
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

const groupDoc = (groupId) => groupsCollection().doc(groupId);

const getGroupOrThrow = async (groupId) => {
  const snapshot = await groupDoc(groupId).get();
  if (!snapshot.exists) {
    const error = new Error("Group not found");
    error.statusCode = 404;
    throw error;
  }
  return { ref: snapshot.ref, data: snapshot.data() };
};

export const leaveGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    must(groupId, "groupId");
    must(userId, "userId");

    const { ref } = await getGroupOrThrow(groupId);
    await ref.update({
      memberIds: FieldValue.arrayRemove(userId),
      admins: FieldValue.arrayRemove(userId),
      updatedAt: new Date(),
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const addGroupMember = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { requesterId, memberUid } = req.body;
    must(groupId, "groupId");
    must(requesterId, "requesterId");
    must(memberUid, "memberUid");

    const { ref, data } = await getGroupOrThrow(groupId);
    if (!data.admins?.includes(requesterId)) {
      const error = new Error("Only admins can add members.");
      error.statusCode = 403;
      throw error;
    }

    await ref.update({
      memberIds: FieldValue.arrayUnion(memberUid),
      updatedAt: new Date(),
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const toggleGroupAdmin = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { requesterId, memberUid, makeAdmin } = req.body;
    must(groupId, "groupId");
    must(requesterId, "requesterId");
    must(memberUid, "memberUid");

    const { ref, data } = await getGroupOrThrow(groupId);
    if (!data.admins?.includes(requesterId)) {
      const error = new Error("Only admins can update admin rights.");
      error.statusCode = 403;
      throw error;
    }

    if (!makeAdmin && memberUid === data.createdBy) {
      const error = new Error("Group creator must remain an admin.");
      error.statusCode = 400;
      throw error;
    }

    await ref.update({
      admins: makeAdmin ? FieldValue.arrayUnion(memberUid) : FieldValue.arrayRemove(memberUid),
      updatedAt: new Date(),
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const removeGroupMember = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { requesterId, memberUid } = req.body;
    must(groupId, "groupId");
    must(requesterId, "requesterId");
    must(memberUid, "memberUid");

    const { ref, data } = await getGroupOrThrow(groupId);

    if (!data.admins?.includes(requesterId)) {
      const error = new Error("Only admins can remove members.");
      error.statusCode = 403;
      throw error;
    }

    if (memberUid === requesterId) {
      const error = new Error("Use Leave Group to remove yourself.");
      error.statusCode = 400;
      throw error;
    }

    if (memberUid === data.createdBy) {
      const error = new Error("Group creator cannot be removed.");
      error.statusCode = 400;
      throw error;
    }

    await ref.update({
      memberIds: FieldValue.arrayRemove(memberUid),
      admins: FieldValue.arrayRemove(memberUid),
      updatedAt: new Date(),
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
