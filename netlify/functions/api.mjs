import { json, telegramUser, rpc, selectRows, insertRow, upsertRow, updateRows, newId, sameSecret } from "./lib/db.mjs";

const BOT_API = "https://api.telegram.org/bot";
const PLANS = { silver: { stars: 100 }, gold: { stars: 250 }, diamond: { stars: 500 } };
const CHANNEL = "@NairaHackerAI_Official";
const WITHDRAWAL_UNLOCK = Date.parse("2027-04-01T00:00:00+01:00");

async function telegram(method, body) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is not configured in Netlify.");
  const response = await fetch(BOT_API + token + "/" + method, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || "Telegram API request failed.");
  return result.result;
}
async function ensureProfile(user) {
  await upsertRow("kencoin_profiles", {
    telegram_id: String(user.id), username: user.username || null,
    first_name: user.first_name || null, last_name: user.last_name || null,
    updated_at: new Date().toISOString()
  }, "telegram_id");
}
async function balanceFor(id) {
  const rows = await selectRows("kencoin_ledger", "select=amount&telegram_id=eq." + id);
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}
async function withdrawalInfo(id) {
  const locked = Date.now() < WITHDRAWAL_UNLOCK;
  const settings = await selectRows("kencoin_settings", "select=setting_value&setting_key=eq.minimum_withdrawal_knv&limit=1");
  const minimum = Number(settings[0]?.setting_value || 0) || null;
  const rows = await selectRows("kencoin_withdrawals", "select=id,amount,network,wallet_address,status,admin_note,tx_reference,created_at,reviewed_at,paid_at&telegram_id=eq." + id + "&order=created_at.desc&limit=50");
  const balance = await balanceFor(id);
  const reserved = rows.filter(x => ["pending","approved"].includes(x.status)).reduce((sum,x) => sum + Number(x.amount),0);
  return { locked, minimum, balance, available_balance: balance - reserved, history: rows };
}
function validWallet(network, address) {
  if (network === "USDT_TRC20") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  if (network === "USDT_BEP20") return /^0x[a-fA-F0-9]{40}$/.test(address);
  return false;
}
function routeOf(url) {
  return url.pathname.replace(/^\/(?:api|\.netlify\/functions\/api)\/?/, "").replace(/\/$/, "");
}
export default async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const url = new URL(req.url), route = routeOf(url);
  try {
    if (route === "admin/withdrawals") {
      if (!sameSecret(process.env.ADMIN_SECRET || "", req.headers.get("x-kencoin-admin-secret") || "")) return json({ error: "Forbidden" }, 403);
      if (req.method === "GET") {
        const status = url.searchParams.get("status") || "pending";
        const rows = await selectRows("kencoin_withdrawals", "select=*&status=eq." + encodeURIComponent(status) + "&order=created_at.asc&limit=100");
        return json({ withdrawals: rows });
      }
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const result = await rpc("kencoin_review_withdrawal", {
          p_withdrawal_id: body.withdrawal_id, p_status: body.status,
          p_admin_note: body.admin_note || null, p_tx_reference: body.tx_reference || null
        });
        return json(result);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    if (route === "payment/create") {
      const plan = PLANS[body.plan];
      if (!plan) return json({ error: "Invalid membership plan." }, 400);
      const payload = "kc_" + body.plan + "_" + id + "_" + newId();
      await insertRow("kencoin_invoices", { payload, telegram_id: id, plan: body.plan, stars: plan.stars, status: "pending" });
      try {
        const invoiceLink = await telegram("createInvoiceLink", {
          title: "Kencoin " + body.plan.toUpperCase() + " Membership",
          description: body.plan + " membership for 30 days",
          payload, currency: "XTR", prices: [{ label: body.plan + " membership", amount: plan.stars }], provider_token: ""
        });
        return json({ invoice_link: invoiceLink });
      } catch (error) {
        await updateRows("kencoin_invoices", "payload=eq." + encodeURIComponent(payload), { status: "failed" });
        throw error;
      }
    }
    if (route === "withdrawals") {
      if (Date.now() < WITHDRAWAL_UNLOCK) return json({ error: "Withdrawals are locked." }, 403);
      const amount = Number(body.amount), network = String(body.network || ""), address = String(body.wallet_address || "").trim();
      if (!Number.isSafeInteger(amount) || amount <= 0) return json({ error: "Enter a valid whole-number KNV amount." }, 400);
      if (!validWallet(network, address)) return json({ error: "Enter a valid wallet address for the selected USDT network." }, 400);
      const result = await rpc("kencoin_create_withdrawal", { p_telegram_id: id, p_amount: amount, p_network: network, p_wallet_address: address });
      return json({ ...result, message: "Withdrawal request submitted for admin review." });
    }
    return json({ error: "Unknown API action: " + route }, 404);
  } catch (error) {
    const message = String(error?.message || "Server error");
    const status = /withdrawals_locked/.test(message) ? 403 : /withdrawal_setup_incomplete/.test(message) ? 503 : /below_minimum_withdrawal|insufficient_available_balance|invalid_network/.test(message) ? 400 : 500;
    return json({ error: message.replace(/^.*\(\d+\)$/, "Request failed") }, status);
  }
};
