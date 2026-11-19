import { json, telegramUser, rpc, selectRows, selectAllRows, insertRow, upsertRow, updateRows, newId, sameSecret } from "./lib/db.mjs";

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
  const rows = await selectAllRows("kencoin_ledger", "select=amount&telegram_id=eq." + id);
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}
async function withdrawalInfo(id) {
  const locked = Date.now() < WITHDRAWAL_UNLOCK;
  const settings = await selectRows("kencoin_settings", "select=setting_value&setting_key=eq.minimum_withdrawal_knv&limit=1");
  const minimum = Number(settings[0]?.setting_value || 0) || null;
  const [rows, reservedRows, balance] = await Promise.all([
    selectRows("kencoin_withdrawals", "select=id,amount,network,wallet_address,status,admin_note,tx_reference,created_at,reviewed_at,paid_at&telegram_id=eq." + id + "&order=created_at.desc&limit=50"),
    selectRows("kencoin_withdrawals", "select=amount&telegram_id=eq." + id + "&status=in.(pending,approved)"),
    balanceFor(id)
  ]);
  const reserved = reservedRows.reduce((sum,x) => sum + Number(x.amount),0);
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
    // Server-to-server admin route. Protected by ADMIN_SECRET, not Mini App auth.
    if (route === "admin/withdrawals") {
      if (!sameSecret(process.env.ADMIN_SECRET || "", req.headers.get("x-kencoin-admin-secret") || "")) return json({ error: "Forbidden" }, 403);
      if (req.method === "GET") {
        const status = url.searchParams.get("status") || "pending";
        if (!["pending","approved"].includes(status)) return json({ error: "Invalid status." }, 400);
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

    // Telebot Creator calls these endpoints after receiving Telegram updates.
    if (route === "payment/precheckout") {
      if (!sameSecret(process.env.PAYMENT_CONFIRM_SECRET || "", req.headers.get("x-kencoin-payment-secret") || "")) return json({ ok: false, error: "Forbidden" }, 403);
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const body = await req.json().catch(() => ({}));
      const payload = String(body.payload || ""), userId = String(body.user_id || "");
      const currency = String(body.currency || ""), total = Number(body.total_amount);
      if (!/^kc_(silver|gold|diamond)_\d{3,20}_[A-Za-z0-9]+$/.test(payload) || payload.split("_")[2] !== userId || currency !== "XTR") return json({ ok: false, error: "Invalid invoice details." }, 400);
      const invoices = await selectRows("kencoin_invoices", "select=telegram_id,plan,stars,status,created_at&payload=eq." + encodeURIComponent(payload) + "&limit=1");
      const invoice = invoices[0];
      if (!invoice || String(invoice.telegram_id) !== userId || invoice.plan !== payload.split("_")[1] || invoice.status !== "pending" || Number(invoice.stars) !== total || Date.now() - Date.parse(invoice.created_at) > 24 * 60 * 60 * 1000) return json({ ok: false, error: "Invoice is not valid for this account or amount." }, 403);
      return json({ ok: true });
    }
    if (route === "referral/register-bot") {
      if (!sameSecret(process.env.BOT_WEBHOOK_SECRET || "", req.headers.get("x-kencoin-bot-secret") || "")) return json({ error: "Forbidden" }, 403);
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
      const body = await req.json().catch(() => ({}));
      const invitee = String(body.invitee_id || ""), referrer = String(body.referrer_id || "");
      if (!/^\d{3,20}$/.test(invitee) || !/^\d{3,20}$/.test(referrer) || invitee === referrer) return json({ error: "Invalid referral." }, 400);
      const existingInvitee = await selectRows("kencoin_profiles", "select=telegram_id&telegram_id=eq." + invitee + "&limit=1");
      if (!existingInvitee.length) await insertRow("kencoin_profiles", { telegram_id: invitee, first_name: body.first_name || null, username: body.username || null });
      return json(await rpc("kencoin_register_referral", { p_invitee: invitee, p_referrer: referrer }));
    }

    const user = await telegramUser(req);
    if (!user?.id) return json({ error: "Open Kencoin inside Telegram to continue." }, 401);
    await ensureProfile(user);
    const id = String(user.id);

    if (req.method === "GET" && route === "me") {
      const [ledger, invoices, referrals, withdrawal] = await Promise.all([
        selectRows("kencoin_ledger", "select=amount,entry_type,reference,description,created_at&telegram_id=eq." + id + "&order=created_at.desc&limit=100"),
        selectRows("kencoin_invoices", "select=plan,expires_at&telegram_id=eq." + id + "&status=eq.paid&order=expires_at.desc&limit=10"),
        selectRows("kencoin_referrals", "select=invitee_id&referrer_id=eq." + id),
        withdrawalInfo(id)
      ]);
      const active = invoices.find(x => x.expires_at && Date.parse(x.expires_at) > Date.now());
      // Use the full ledger total from withdrawalInfo; the history query is intentionally capped.
      const balance = withdrawal.balance;
      return json({
        user: { telegram_id: id, first_name: user.first_name || "Member", balance, membership: active ? active.plan.toUpperCase() : "STANDARD", membership_expires_at: active?.expires_at || null },
        history: ledger, referrals_count: referrals.length,
        withdrawals: { locked: withdrawal.locked, available_balance: withdrawal.available_balance, history: withdrawal.history },
        usd_equivalent: (balance / 100).toFixed(2)
      });
    }
    if (req.method === "GET" && route === "withdrawals") return json(await withdrawalInfo(id));
    if (req.method === "GET" && route === "referral/stats") {
      const rows = await selectRows("kencoin_referrals", "select=invitee_id&referrer_id=eq." + id);
      return json({ count: rows.length, reward_amount: 0, message: "Referral rewards are not enabled." });
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const body = await req.json().catch(() => ({}));

    if (route === "daily_bonus") {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const result = await rpc("kencoin_claim_reward", {
        p_telegram_id: id, p_amount: 3, p_entry_type: "daily_bonus",
        p_reference: "daily-" + day, p_description: "Daily bonus", p_metadata: { day }
      });
      return json({ ...result, message: result.credited ? "3 KNV daily bonus credited." : "Today's daily bonus has already been claimed." });
    }
    if (route === "task/channel") {
      const member = await telegram("getChatMember", { chat_id: CHANNEL, user_id: Number(id) });
      if (!["member", "administrator", "creator"].includes(member.status)) return json({ error: "Join the official channel first, then verify again." }, 403);
      const result = await rpc("kencoin_claim_reward", {
        p_telegram_id: id, p_amount: 10, p_entry_type: "channel_task",
        p_reference: "channel-join", p_description: "Verified official Telegram channel join", p_metadata: { channel: CHANNEL }
      });
      return json({ ...result, message: result.credited ? "10 KNV channel task credited." : "Channel task already claimed." });
    }
    if (route === "ad/start") {
      // Monetag retries failed postbacks for up to ~38 hours. Keep sessions
      // valid for 48 hours, then retire abandoned sessions before creating one.
      await updateRows(
        "kencoin_ad_sessions",
        "telegram_id=eq." + id + "&status=eq.pending&created_at=lt." + encodeURIComponent(new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()),
        { status: "ignored" }
      );
      const ymid = "kc_" + id + "_" + newId();
      await insertRow("kencoin_ad_sessions", { ymid, telegram_id: id, zone_id: "12287936", status: "pending" });
      return json({ ymid });
    }
    if (route === "referral/register") {
      const referrer = String(body.referrer_id || "");
      if (!/^\d{3,20}$/.test(referrer) || referrer === id) return json({ error: "Invalid referral link." }, 400);
      return json(await rpc("kencoin_register_referral", { p_invitee: id, p_referrer: referrer }));
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
    const status = /withdrawals_locked/.test(message) ? 403 : /withdrawal_setup_incomplete/.test(message) ? 503 : /below_minimum_withdrawal|insufficient_available_balance|invalid_network|invalid_withdrawal_amount|invalid_wallet_address/.test(message) ? 400 : 500;
    if (status === 500) {
      console.error("[Kencoin API]", message);
      return json({ error: "Kencoin service is temporarily unavailable. Please try again." }, 500);
    }
    const friendly = /withdrawals_locked/.test(message) ? "Withdrawals are locked." :
      /withdrawal_setup_incomplete/.test(message) ? "Withdrawal setup is not complete yet." :
      /below_minimum_withdrawal/.test(message) ? "The requested amount is below the minimum." :
      /insufficient_available_balance/.test(message) ? "Insufficient available KNV balance." :
      /invalid_network/.test(message) ? "Invalid USDT network." :
      /invalid_withdrawal_amount/.test(message) ? "Enter a valid whole-number KNV amount." :
      /invalid_wallet_address/.test(message) ? "Enter a valid wallet address." : message;
    return json({ error: friendly }, status);
  }
};
