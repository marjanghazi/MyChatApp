import { FieldValue } from "firebase-admin/firestore";
import { getFirestore } from "../config/firebaseAdmin.js";

const db = getFirestore();

const must = (value, name) => {
  if (!value || (typeof value === "string" && !value.trim())) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    throw error;
  }
};

const messagePreview = (payload) => {
  if (payload.type === "text") return payload.text;
  const icon = payload.type === "audio" ? "🎤" : payload.type === "video" ? "🎬" : "📎";
  return `${icon} ${payload.fileName || "attachment"}`;
};

export const sendMessage = async (req, res, next) => {
  try {
    const {
      threadType,
      actorUid,
      actorName,
      actorPhone,
      targetUid,
      targetPhone,
      threadId,
      isTargetOnline,
      payload,
      replyTo,
    } = req.body;

    must(threadType, "threadType");
    must(actorUid, "actorUid");
    must(actorName, "actorName");

    if (threadType === "direct") {
      must(targetUid, "targetUid");
      must(threadId, "threadId");

      const conversationRef = db.collection("conversations").doc(threadId);
      const finalPayload = {
        ...payload,
        ...(replyTo ? { replyTo } : {}),
        senderId: actorUid,
        receiverId: targetUid,
        createdAt: FieldValue.serverTimestamp(),
        deliveredTo: [actorUid, ...(isTargetOnline ? [targetUid] : [])],
        readBy: [actorUid],
      };

      await conversationRef.set(
        {
          participants: [actorUid, targetUid],
          participantPhones: [actorPhone || "", targetPhone || ""],
          lastMessage: messagePreview(payload),
          lastMessageType: payload.type,
          lastMessageSender: actorUid,
          lastMessageStatus: isTargetOnline ? "delivered" : "sent",
          lastMessageAt: FieldValue.serverTimestamp(),
          typing: { [actorUid]: false },
          unreadBy: { [actorUid]: 0, [targetUid]: FieldValue.increment(1) },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await conversationRef.collection("messages").add(finalPayload);
      res.json({ ok: true });
      return;
    }

    if (threadType === "group") {
      must(threadId, "threadId");
      const groupRef = db.collection("groups").doc(threadId);
      const finalPayload = {
        text: payload.text || "",
        type: payload.type || "text",
        senderId: actorUid,
        senderName: actorName,
        createdAt: FieldValue.serverTimestamp(),
        ...(replyTo ? { replyTo } : {}),
      };

      await groupRef.collection("messages").add(finalPayload);
      await groupRef.set(
        {
          lastMessage: finalPayload.text,
          lastMessageAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      res.json({ ok: true });
      return;
    }

    if (threadType === "channel") {
      must(threadId, "threadId");
      const channelRef = db.collection("channels").doc(threadId);
      await channelRef.collection("posts").add({
        text: payload.text || "",
        type: "post",
        senderId: actorUid,
        senderName: actorName,
        createdAt: FieldValue.serverTimestamp(),
      });
      await channelRef.set(
        {
          lastPost: payload.text || "",
          lastPostAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      res.json({ ok: true });
      return;
    }

    const err = new Error("Unsupported threadType");
    err.statusCode = 400;
    throw err;
  } catch (error) {
    next(error);
  }
};

const getMessageRef = ({ threadType, threadId, messageId }) => {
  if (threadType === "direct") return db.collection("conversations").doc(threadId).collection("messages").doc(messageId);
  if (threadType === "group") return db.collection("groups").doc(threadId).collection("messages").doc(messageId);
  return null;
};

export const editMessage = async (req, res, next) => {
  try {
    const { threadType, threadId, messageId, text } = req.body;
    must(threadType, "threadType");
    must(threadId, "threadId");
    must(messageId, "messageId");
    must(text, "text");

    const ref = getMessageRef({ threadType, threadId, messageId });
    must(ref, "messageRef");
    await ref.update({ text, editedAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const deleteForMe = async (req, res, next) => {
  try {
    const { threadType, threadId, messageId, actorUid } = req.body;
    must(threadType, "threadType");
    must(threadId, "threadId");
    must(messageId, "messageId");
    must(actorUid, "actorUid");

    const ref = getMessageRef({ threadType, threadId, messageId });
    must(ref, "messageRef");
    await ref.update({ deletedFor: FieldValue.arrayUnion(actorUid) });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const deleteForEveryone = async (req, res, next) => {
  try {
    const { threadType, threadId, messageId } = req.body;
    must(threadType, "threadType");
    must(threadId, "threadId");
    must(messageId, "messageId");

    const ref = getMessageRef({ threadType, threadId, messageId });
    must(ref, "messageRef");
    await ref.update({
      text: "🚫 This message was deleted.",
      deletedForEveryone: true,
      deletedAt: FieldValue.serverTimestamp(),
      fileURL: null,
      fileName: null,
      fileSize: null,
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const toggleMessageFlag = async (req, res, next) => {
  try {
    const { threadType, threadId, messageId, actorUid, key, alreadyFlagged } = req.body;
    must(threadType, "threadType");
    must(threadId, "threadId");
    must(messageId, "messageId");
    must(actorUid, "actorUid");
    must(key, "key");

    const ref = getMessageRef({ threadType, threadId, messageId });
    must(ref, "messageRef");
    const value = alreadyFlagged ? FieldValue.arrayRemove(actorUid) : FieldValue.arrayUnion(actorUid);
    await ref.update({ [key]: value });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
