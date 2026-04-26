import { Router } from "express";
import { addContactByPhone, checkPhoneAvailability } from "../controllers/userController.js";

const router = Router();

router.post("/check-phone", checkPhoneAvailability);
router.post("/:uid/contacts", addContactByPhone);

export default router;
