import { getFirestore } from "../config/firebaseAdmin.js";

const db = getFirestore();

const must = (value, name) => {
  if (!value || (typeof value === "string" && !value.trim())) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    throw error;
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const { excludeUid } = req.query;
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs
      .map((doc) => doc.data())
      .filter((user) => user.uid !== excludeUid);
    res.json({ users });
  } catch (error) {
    next(error);
  }
};

export const listConversationsByUid = async (req, res, next) => {
  try {
    const { uid } = req.query;
    must(uid, "uid");

    const snapshot = await db
      .collection("conversations")
      .where("participants", "array-contains", uid)
      .get();

    const conversations = {};
    snapshot.forEach((doc) => {
      conversations[doc.id] = doc.data();
    });

    res.json({ conversations });
  } catch (error) {
    next(error);
  }
};

export const markConversationDelivered = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    must(conversationId, "conversationId");

    await db.collection("conversations").doc(conversationId).update({
      lastMessageStatus: "delivered",
      updatedAt: new Date(),
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const listGroupsByUid = async (req, res, next) => {
  try {
    const { uid } = req.query;
    must(uid, "uid");

    const snapshot = await db
      .collection("groups")
      .where("memberIds", "array-contains", uid)
      .get();

    const groups = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    res.json({ groups });
  } catch (error) {
    next(error);
  }
};

export const listChannels = async (_req, res, next) => {
  try {
    const snapshot = await db.collection("channels").get();
    const channels = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ channels });
  } catch (error) {
    next(error);
  }
};
