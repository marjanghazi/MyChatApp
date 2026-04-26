import { Router } from "express";
import {
  addDocByPath,
  commitBatchByPath,
  deleteDocByPath,
  getDocsByPath,
  setDocByPath,
  updateDocByPath,
} from "../controllers/dbController.js";

const router = Router();

router.post("/set-doc", setDocByPath);
router.post("/update-doc", updateDocByPath);
router.post("/add-doc", addDocByPath);
router.post("/delete-doc", deleteDocByPath);
router.post("/get-docs", getDocsByPath);
router.post("/commit-batch", commitBatchByPath);

export default router;
