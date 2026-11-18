import { getStore } from "@netlify/blobs";

const ZONE_ID = "12287936";
const REWARD_KNV = 5;

export default async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams;
  const expected = process.env.POSTBACK_SECRET || "";
  const supplied = q.get("secret") || "";

  if (!expected || supplied.length !== expected.length) {
    return new Response("Forbidden", { status: 403 });
  }
  let same = 0;
  for (let i = 0; i < expected.length; i++) same |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (same !== 0) return new Response("Forbidden", { status: 403 });

  const ymid = q.get("ymid") || "";
  const telegramId = q.get("telegram_id") || "";
  const eventType = q.get("event_type") || "";
  const rewardType = q.get("reward_event_type") || "";
  const zoneId = q.get("zone_id") || "";

  if (!ymid || !/^[A-Za-z0-9_.-]{1,180}$/.test(ymid) ||
      !/^\d{5,20}$/.test(telegramId) || zoneId !== ZONE_ID ||
      eventType !== "impression") {
    return new Response("Invalid postback", { status: 400 });
  }

  // Monetag may retry notifications. Store one immutable record per ad-show ID.
  // Only paid/valued impressions earn rewards; clicks and non-valued events do not.
  if (rewardType === "valued") {
    const store = getStore("kencoin-monetag-rewards");
    const result = await store.setJSON("ad-" + ymid, {
      telegramId,
      ymid,
      zoneId,
      reward: REWARD_KNV,
      currency: "KNV",
      eventType,
      rewardType,
      estimatedPrice: q.get("estimated_price") || "0",
      createdAt: new Date().toISOString()
    }, { onlyIfNew: true });

    return new Response(result.modified ? "Reward recorded" : "Duplicate ignored", { status: 200 });
  }

  if (rewardType === "non_valued") return new Response("Unpaid event ignored", { status: 200 });
  return new Response("Unknown reward event", { status: 400 });
};
