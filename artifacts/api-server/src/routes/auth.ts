import { Router } from "express";
import { createToken } from "../lib/auth.js";

const router = Router();

/**
 * POST /api/:client/dashboard/api/login
 * Body: { password: string }
 * Returns: { token: string }
 *
 * Client passwords are read from env vars:
 *   UNBOKS_PASSWORD, BLUEMARLIN_PASSWORD, ADAMUS_PASSWORD, etc.
 */
router.post("/:client/dashboard/api/login", (req, res) => {
  const { client } = req.params;
  const { password } = req.body as { password?: string };

  if (!password) {
    res.status(400).json({ detail: "Password required" });
    return;
  }

  const envKey = `${client.toUpperCase().replace(/-/g, "_")}_PASSWORD`;
  const expected = process.env[envKey];

  if (!expected || password !== expected) {
    res.status(401).json({ detail: "Wrong password" });
    return;
  }

  const token = createToken(client);
  res.json({ token });
});

export default router;
