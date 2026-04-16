import { addDoc, arrayRemove, arrayUnion, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export const createGroup = async ({ name, description, memberIds, creatorId }) => {
  const payload = {
    name: name.trim(),
    description: description.trim(),
    memberIds: Array.from(new Set([creatorId, ...memberIds])),
    admins: [creatorId],
    createdBy: creatorId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: "",
    lastMessageAt: null,
  };

  return addDoc(collection(db, "groups"), payload);
};

export const createChannel = async ({ name, description, creatorId }) => {
  const payload = {
    name: name.trim(),
    description: description.trim(),
    ownerId: creatorId,
    followerIds: [creatorId],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastPost: "",
    lastPostAt: null,
  };

  return addDoc(collection(db, "channels"), payload);
};

export const followChannel = async (channelId, userId) => {
  await updateDoc(doc(db, "channels", channelId), {
    followerIds: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });
};

export const unfollowChannel = async (channelId, userId) => {
  await updateDoc(doc(db, "channels", channelId), {
    followerIds: arrayRemove(userId),
    updatedAt: serverTimestamp(),
  });
};
