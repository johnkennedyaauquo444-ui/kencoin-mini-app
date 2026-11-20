import crypto from "node:crypto";

const BOT_TOKEN = process.env.BOT_TOKEN;
const AGNES_API_KEY = process.env.AGNES_API_KEY;
const MODEL = "agnes-video-2.5-flash";
const AGNES = "https://apihub.agnes-ai.com";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function verifyTelegram(initData) {
  if (!BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256", secret).update(check).digest("hex");
  const a = Buffer.from(hash, "hex"), b = Buffer.from(calculated, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now()/1000-authDate > 3600 || authDate > Date.now()/1000+60) return null;
  try { return JSON.parse(params.get("user")); } catch { return null; }
}
function makeJobToken(videoId, userId) {
  const payload = Buffer.from(JSON.stringify({ videoId, userId: String(userId), createdAt: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", BOT_TOKEN).update(payload).digest("base64url");
  return payload + "." + signature;
}
async function agnes(path, body) {
  const response = await fetch(AGNES + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${AGNES_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || data.code || "Agnes API request failed.");
  return data;
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const user = verifyTelegram(request.headers.get("authorization")?.replace(/^tma\s+/, ""));
  if (!user) return json({ error: "Open VIDEO FACTORY AI inside Telegram and try again." }, 401);
  if (!AGNES_API_KEY) return json({ error: "Agnes API key is not configured in Netlify." }, 503);
  try {
    const form = await request.formData();
    const prompt = String(form.get("prompt") || "").trim();
    const mode = String(form.get("mode") || "text");
    const ratio = String(form.get("aspect_ratio") || "9:16");
    const seconds = String(form.get("duration") || "5");
    if (prompt.length < 8 || prompt.length > 1800) return json({ error: "Prompt must be between 8 and 1,800 characters." }, 400);
    if (!["text","image"].includes(mode)) return json({ error: "Unsupported generation mode." }, 400);
    if (!["9:16","16:9","1:1"].includes(ratio)) return json({ error: "Unsupported aspect ratio." }, 400);
    if (!["5","8","10"].includes(seconds)) return json({ error: "Unsupported duration." }, 400);
    const payload = { model: MODEL, prompt, mode: mode === "image" ? "keyframe" : "text", seconds, size: "720P", aspect_ratio: ratio, n: 1 };
    if (mode === "image") {
      const file = form.get("image");
      if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Choose an image first." }, 400);
      if (file.size > 4 * 1024 * 1024) return json({ error: "Image must be 4 MB or smaller on Netlify." }, 400);
      if (!["image/jpeg","image/png","image/webp"].includes(file.type)) return json({ error: "Use a JPG, PNG or WEBP image." }, 400);
      const bytes = Buffer.from(await file.arrayBuffer());
      payload.first_frame = `data:${file.type};base64,${bytes.toString("base64")}`;
    }
    const data = await agnes("/v1/videos", payload);
    const videoId = data.video_id || data.id;
    if (!videoId) return json({ error: "Agnes did not return a video ID." }, 502);
    return json({ id: makeJobToken(String(videoId), user.id), status: data.status || "queued" }, 202);
  } catch (error) {
    console.error("Agnes create error:", error.message);
    return json({ error: error.message || "Could not start video generation." }, 502);
  }
};

export const config = { path: "/api/video/generate" };
