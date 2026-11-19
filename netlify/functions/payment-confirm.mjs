import { json, rpc, sameSecret } from "./lib/db.mjs";

export default async req => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameSecret(process.env.PAYMENT_CONFIRM_SECRET || "", req.headers.get("x-kencoin-payment-secret") || "")) {
    return json({ error: "Forbidden" }, 403);
  }
  try {
    const body = await req.json();
    const payload = String(body.payload || "");
    const userId = String(body.user_id || "");
    const chargeId = String(body.telegram_charge_id || "");
    if (!/^kc_(silver|gold|diamond)_\d{3,20}_[A-Za-z0-9]+$/.test(payload) ||
        !/^\d{3,20}$/.test(userId) || !chargeId || chargeId.length > 256) {
      return json({ error: "Invalid payment reference." }, 400);
    }
    const payloadUser = payload.split("_")[2];
    if (payloadUser !== userId) return json({ error: "Invoice user mismatch." }, 403);
    const result = await rpc("kencoin_confirm_stars", {
      p_payload: payload, p_telegram_id: userId,
      p_currency: String(body.currency || ""),
      p_total_amount: Number(body.total_amount),
      p_charge_id: chargeId
    });
    return json(result);
  } catch (error) {
    return json({ error: error.message || "Payment confirmation failed." }, 400);
  }
};
