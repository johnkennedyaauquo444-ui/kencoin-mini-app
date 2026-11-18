
const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN environment variable is required");
}

// Verify Telegram Mini App authentication.
function verifyTelegram(initData) {
  if (!initData || !BOT_TOKEN) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");

  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const calculated = crypto
    .createHmac("sha256", secret)
    .update(dataCheck)
    .digest("hex");

  if (!crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(calculated, "hex")
  )) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > 3600) {
    return null;
  }

  try {
    return JSON.parse(params.get("user"));
  } catch {
    return null;
  }
}

function authenticated(req, res, next) {
  const initData = req.headers.authorization?.replace("tma ", "");
  const user = verifyTelegram(initData);

  if (!user) {
    return res.status(401).json({ error: "Invalid Telegram session" });
  }

  req.user = user;
  next();
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    app: "KENCOIN",
    rewards: "verification required"
  });
});

app.post("/api/daily_bonus", authenticated, (req, res) => {
  res.status(503).json({
    error: "Daily bonus database is not connected. No reward credited."
  });
});

app.post("/api/ad/start", authenticated, (req, res) => {
  res.status(503).json({
    error: "Monetag server-side verification is not connected.",
    zone_id: "12287936",
    credited: false
  });
});

app.post("/api/payment/create", authenticated, (req, res) => {
  const plans = {
    silver: 100,
    gold: 250,
    diamond: 500
  };

  if (!plans[req.body.plan]) {
    return res.status(400).json({ error: "Invalid membership plan" });
  }

  res.status(503).json({
    error: "Telegram Stars invoice service must be connected.",
    credited: false
  });
});

app.post("/api/withdraw", authenticated, (req, res) => {
  res.json({
    status: "coming_soon",
    message: "Withdrawals are coming soon."
  });
});

app.listen(PORT, () => {
  console.log(`KENCOIN backend listening on ${PORT}`);
});
                       
