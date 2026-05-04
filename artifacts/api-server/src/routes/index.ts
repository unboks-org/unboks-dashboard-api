import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import webhookRouter from "./webhook.js";
import conversationsRouter from "./conversations.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(webhookRouter);
router.use(conversationsRouter);

export default router;
