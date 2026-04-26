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
