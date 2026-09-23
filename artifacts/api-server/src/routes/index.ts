import { Router, type IRouter } from "express";
import healthRouter from "./health";
import teammatesRouter from "./teammates";
import filesRouter from "./files";
import keysRouter from "./keys";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/teammates", teammatesRouter);
router.use("/files", filesRouter);
router.use("/keys", keysRouter);
router.use("/chat", chatRouter);

export default router;
