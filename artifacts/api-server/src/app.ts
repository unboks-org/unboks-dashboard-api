import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const ALLOWED_ORIGINS = process.env.NODE_ENV === "production"
  ? [
      "https://dashboard.unboks.org",
      "https://unboks.org",
      "https://api.unboks.org",
      "https://unboks-dashboard-api.replit.app",
    ]
  : true; // allow all in development

app.use(cors({ origin: ALLOWED_ORIGINS }));

// Capture raw body buffer BEFORE JSON parsing — required for webhook signature verification.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Record<string, unknown>)["rawBody"] = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
