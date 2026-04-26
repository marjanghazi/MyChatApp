import { FieldValue } from "firebase-admin/firestore";
import { getFirestore } from "../config/firebaseAdmin.js";

const db = getFirestore();

const usersCollection = () => db.collection("users");

const must = (value, name) => {
  if (!value || (typeof value === "string" && !value.trim())) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    throw error;
  }
};

const buildPhoneVariants = (raw = "") => {
  const digits = String(raw).replace(/\D/g, "");
  const variants = new Set([digits]);
  if (digits.startsWith("0") && digits.length > 1) variants.add(`92${digits.slice(1)}`);
  if (digits.startsWith("92") && digits.length > 2) variants.add(`0${digits.slice(2)}`);
  return [...variants].filter(Boolean);
};

export const checkPhoneAvailability = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    must(phoneNumber, "phoneNumber");

    const phoneVariants = buildPhoneVariants(phoneNumber);
    if (!phoneVariants.length) {
      const error = new Error("A valid phone number is required.");
      error.statusCode = 400;
      throw error;
    }

    const [exactSnap, variantSnap] = await Promise.all([
      usersCollection().where("phoneNumber", "in", phoneVariants).limit(1).get(),
      usersCollection().where("phoneLookupKeys", "array-contains-any", phoneVariants).limit(1).get(),
    ]);

    res.json({
      available: exactSnap.empty && variantSnap.empty,
      normalizedPhone: phoneVariants[0],
      phoneVariants,
    });
  } catch (error) {
    next(error);
  }
};

export const addContactByPhone = async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { phoneNumber } = req.body;

    must(uid, "uid");
    must(phoneNumber, "phoneNumber");

    const phoneVariants = buildPhoneVariants(phoneNumber);
    if (!phoneVariants.length) {
      const error = new Error("Please enter a valid phone number.");
      error.statusCode = 400;
      throw error;
    }

    const [directMatch, variantMatch] = await Promise.all([
      usersCollection().where("phoneNumber", "in", phoneVariants).get(),
      usersCollection().where("phoneLookupKeys", "array-contains-any", phoneVariants).get(),
    ]);

    const candidates = new Map();
    directMatch.forEach((entry) => candidates.set(entry.id, entry.data()));
    variantMatch.forEach((entry) => candidates.set(entry.id, entry.data()));
    const candidate = [...candidates.values()][0];

    if (!candidate) {
      const error = new Error("No registered user found with that number.");
      error.statusCode = 404;
      throw error;
    }

    if (candidate.uid === uid) {
      const error = new Error("You cannot add your own number.");
      error.statusCode = 400;
      throw error;
    }

    await usersCollection().doc(uid).update({
      contacts: FieldValue.arrayUnion(candidate.phoneNumber),
      updatedAt: new Date(),
    });

    res.json({ ok: true, candidate });
  } catch (error) {
    next(error);
  }
};
