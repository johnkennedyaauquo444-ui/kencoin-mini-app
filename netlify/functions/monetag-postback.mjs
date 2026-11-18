import { selectRows, rpc, sameSecret } from "./lib/db.mjs";

const ZONE = "12287936";
export default async req => {
  const query = new URL(req.url).searchParams;
  if (!sameSecret(process.env.POSTBACK_SECRET || "", query.get("secret") || "")) return new Response("Forbidden", { status: 403 });
  const ymid = query.get("ymid") || "";
  const zone = query.get("zone_id") || "";
  const event = query.get("event_type") || "";
  const rewardType = query.get("reward_event_type") || "";
  if (!/^[A-Za-z0-9_.-]{1,180}$/.test(ymid) || zone !== ZONE || !["impression","click"].includes(event)) return new Response("Invalid event", { status: 400 });
  if (rewardType === "non_valued") return new Response("Unpaid event ignored", { status: 200 });
  if (rewardType !== "valued") return new Response("Unknown reward event", { status: 400 });
  try {
    const sessions = await selectRows("kencoin_ad_sessions", "select=telegram_id,status&ymid=eq." + encodeURIComponent(ymid) + "&limit=1");
    const session = sessions[0];
    if (!session) return new Response("Unknown ad session", { status: 404 });
    const telegramId = String(query.get("telegram_id") || session.telegram_id);
    if (telegramId !== String(session.telegram_id)) return new Response("User mismatch", { status: 403 });
    const result = await rpc("kencoin_credit_ad", {
      p_ymid: ymid, p_telegram_id: telegramId,
      p_estimated_price: query.get("estimated_price") || "0"
    });
    return new Response(result.credited ? "Reward credited" : "Duplicate ignored", { status: 200 });
  } catch (error) {
    return new Response("Postback processing failed: " + (error.message || "unknown error"), { status: 500 });
  }
};
