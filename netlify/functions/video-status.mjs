import crypto from "node:crypto";

const BOT_TOKEN = process.env.BOT_TOKEN;
const AGNES_API_KEY = process.env.AGNES_API_KEY;
const MODEL = "agnes-video-2.5-flash";
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
function readJobToken(token, userId) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !BOT_TOKEN) return null;
  const expected = crypto.createHmac("sha256", BOT_TOKEN).update(payload).digest();
  let supplied;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const job = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (job.userId !== String(userId) || Date.now() - job.createdAt > 7 * 24 * 60 * 60 * 1000) return null;
    return job;
  } catch { return null; }
}
export default async (request) => {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const user = verifyTelegram(request.headers.get("authorization")?.replace(/^tma\s+/, ""));
  if (!user) return json({ error: "Open VIDEO FACTORY AI inside Telegram and try again." }, 401);
  if (!AGNES_API_KEY) return json({ error: "Agnes API key is not configured in Netlify." }, 503);
  const token = decodeURIComponent(new URL(request.url).pathname.split("/").pop() || "");
  const job = readJobToken(token, user.id);
  if (!job) return json({ error: "Video job not found for this Telegram account." }, 404);
  try {
    const query = new URLSearchParams({ video_id: job.videoId, model_name: MODEL });
    const response = await fetch("https://apihub.agnes-ai.com/agnesapi?" + query.toString(), {
      headers: { Authorization: `Bearer ${AGNES_API_KEY}` },
      signal: AbortSignal.timeout(55000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || data.code || "Could not check Agnes video status.");
    const state = String(data.status || "processing").toLowerCase();
    return json({ id: token, status: state, progress: data.progress ?? null, url: state === "completed" ? (data.url || null) : null, error: state === "failed" ? (data.error || "Video generation failed.") : null });
  } catch (error) {
    console.error("Agnes status error:", error.message);
    return json({ error: error.message || "Could not check video status." }, 502);
  }
};
export const config = { path: "/api/video/status/:videoId" };
