import { FieldValue } from "firebase-admin/firestore";
import { getFirestore } from "../config/firebaseAdmin.js";

const db = getFirestore();

const DOC_PATH_RULES = [
  /^conversations\/[^/]+$/,
  /^conversations\/[^/]+\/messages\/[^/]+$/,
  /^conversations\/[^/]+\/callLogs\/[^/]+$/,
  /^conversations\/[^/]+\/signals\/[^/]+$/,
  /^groups\/[^/]+$/,
  /^groups\/[^/]+\/messages\/[^/]+$/,
  /^channels\/[^/]+$/,
  /^channels\/[^/]+\/posts\/[^/]+$/,
  /^users\/[^/]+$/,
];

const COLLECTION_PATH_RULES = [
  /^conversations$/,
  /^conversations\/[^/]+\/messages$/,
  /^conversations\/[^/]+\/callLogs$/,
  /^conversations\/[^/]+\/signals$/,
  /^groups$/,
  /^groups\/[^/]+\/messages$/,
  /^channels$/,
  /^channels\/[^/]+\/posts$/,
  /^users$/,
];

const assertAllowedDocPath = (path) => {
  if (!DOC_PATH_RULES.some((rule) => rule.test(path))) {
    const error = new Error(`doc path not allowed: ${path}`);
    error.statusCode = 403;
    throw error;
  }
};

const assertAllowedCollectionPath = (path) => {
  if (!COLLECTION_PATH_RULES.some((rule) => rule.test(path))) {
    const error = new Error(`collection path not allowed: ${path}`);
    error.statusCode = 403;
    throw error;
  }
};

const must = (value, name) => {
  if (!value || (typeof value === "string" && !value.trim())) {
    const error = new Error(`${name} is required`);
    error.statusCode = 400;
    throw error;
  }
};

const applyFieldOps = (value) => {
  if (Array.isArray(value)) return value.map(applyFieldOps);
  if (!value || typeof value !== "object") return value;

  if (value.__op === "serverTimestamp") return FieldValue.serverTimestamp();
  if (value.__op === "increment") return FieldValue.increment(Number(value.value || 0));
  if (value.__op === "arrayUnion") return FieldValue.arrayUnion(...(value.values || []).map(applyFieldOps));
  if (value.__op === "arrayRemove") return FieldValue.arrayRemove(...(value.values || []).map(applyFieldOps));

  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, applyFieldOps(nested)]));
};

const toDocPayload = (payload = {}) => applyFieldOps(payload);

const applyWhere = (queryRef, clause) => {
  if (!clause?.field || !clause?.op) return queryRef;
  return queryRef.where(clause.field, clause.op, clause.value);
};

const applyOrderBy = (queryRef, clause) => {
  if (!clause?.field) return queryRef;
  return queryRef.orderBy(clause.field, clause.direction || "asc");
};

export const setDocByPath = async (req, res, next) => {
  try {
    const { path, data, merge = false } = req.body;
    must(path, "path");
    assertAllowedDocPath(path);
    await db.doc(path).set(toDocPayload(data), { merge: Boolean(merge) });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const updateDocByPath = async (req, res, next) => {
  try {
    const { path, data } = req.body;
    must(path, "path");
    assertAllowedDocPath(path);
    await db.doc(path).update(toDocPayload(data));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const addDocByPath = async (req, res, next) => {
  try {
    const { path, data } = req.body;
    must(path, "path");
    assertAllowedCollectionPath(path);
    const ref = await db.collection(path).add(toDocPayload(data));
    res.json({ ok: true, id: ref.id, path: ref.path });
  } catch (error) {
    next(error);
  }
};

export const deleteDocByPath = async (req, res, next) => {
  try {
    const { path } = req.body;
    must(path, "path");
    assertAllowedDocPath(path);
    await db.doc(path).delete();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const getDocsByPath = async (req, res, next) => {
  try {
    const { path, where = [], orderBy = [] } = req.body;
    must(path, "path");
    assertAllowedCollectionPath(path);

    let queryRef = db.collection(path);
    where.forEach((clause) => {
      queryRef = applyWhere(queryRef, clause);
    });
    orderBy.forEach((clause) => {
      queryRef = applyOrderBy(queryRef, clause);
    });

    const snapshot = await queryRef.get();
    const docs = snapshot.docs.map((entry) => ({
      id: entry.id,
      path: entry.ref.path,
      data: entry.data(),
    }));

    res.json({ docs });
  } catch (error) {
    next(error);
  }
};

export const commitBatchByPath = async (req, res, next) => {
  try {
    const { operations = [] } = req.body;
    const batch = db.batch();

    operations.forEach((operation) => {
      if (!operation?.type || !operation?.path) return;
      assertAllowedDocPath(operation.path);
      if (operation.type === "update") {
        batch.update(db.doc(operation.path), toDocPayload(operation.data));
      }
      if (operation.type === "set") {
        batch.set(db.doc(operation.path), toDocPayload(operation.data), {
          merge: Boolean(operation.merge),
        });
      }
      if (operation.type === "delete") {
        batch.delete(db.doc(operation.path));
      }
    });

    await batch.commit();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
