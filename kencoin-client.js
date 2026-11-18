(() => {
  const api = "/api";
  const auth = () => window.Telegram?.WebApp?.initData || "";
  const tg = () => window.Telegram?.WebApp;
  const note = message => window.notify ? window.notify(message) : alert(message);

  async function call(path, body) {
    const response = await fetch(api + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: "tma " + auth(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function renderHistory(rows) {
    const target = document.getElementById("historyList");
    if (!target) return;
    target.replaceChildren();
    if (!rows?.length) {
      target.textContent = "No activity yet.";
      target.className = "empty";
      return;
    }
    target.className = "";
    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "historyrow";
      const amount = Number(row.amount || 0);
      const sign = amount > 0 ? "+" : "";
      item.textContent = new Date(row.created_at).toLocaleString() + " · " +
        (row.description || row.entry_type || "Wallet activity") + " · " + sign + amount + " KNV";
      target.appendChild(item);
    }
  }

  function renderWithdrawal(data) {
    const locked = document.getElementById("withdrawalLocked");
    const panel = document.getElementById("withdrawalPanel");
    const available = document.getElementById("withdrawalAvailable");
    const minimum = document.getElementById("withdrawalMinimum");
    const amount = document.getElementById("withdrawalAmount");
    const submit = document.getElementById("withdrawalSubmit");
    const history = document.getElementById("withdrawalHistory");
    const historyPanel = document.getElementById("withdrawalHistoryPanel");
    if (locked) locked.hidden = !data.locked;
    if (panel) panel.hidden = !!data.locked;
    if (historyPanel) historyPanel.hidden = !!data.locked;
    if (available) available.textContent = "Available balance: " + Number(data.available_balance || 0).toLocaleString() + " KNV";
    if (amount && data.minimum) amount.min = String(data.minimum);
    if (minimum) minimum.textContent = data.minimum ? "Minimum request: " + Number(data.minimum).toLocaleString() + " KNV." : "Withdrawal minimum is not configured yet. Requests are disabled.";
    if (submit) submit.disabled = !data.minimum;
    if (history) {
      history.replaceChildren();
      if (!data.history?.length) {
        history.textContent = "No withdrawal requests yet.";
        history.className = "empty";
      } else {
        history.className = "";
        for (const item of data.history) {
          const row = document.createElement("div");
          row.className = "historyrow";
          row.textContent = Number(item.amount).toLocaleString() + " KNV · " +
            item.network.replace("_", " ") + " · " + item.status.toUpperCase() +
            " · " + new Date(item.created_at).toLocaleDateString() +
            (item.tx_reference ? " · TX: " + item.tx_reference : "");
          history.appendChild(row);
        }
      }
    }
  }

  window.loadKencoinProfile = async function() {
    if (!auth()) return;
    try {
      const data = await call("/me");
      const balance = Number(data.user?.balance || 0);
      const mainBalance = document.getElementById("balance");
      const walletBalance = document.getElementById("walletBalance");
      const usd = document.getElementById("usdBalance");
      const membership = document.getElementById("membership");
      const username = document.getElementById("username");
      if (mainBalance) mainBalance.innerHTML = balance.toLocaleString() + " <span>KNV</span>";
      if (walletBalance) walletBalance.innerHTML = balance.toLocaleString() + " <span>KNV</span>";
      if (usd) usd.textContent = "≈ $" + (balance / 100).toFixed(2) + " display estimate";
      if (membership) membership.textContent = data.user?.membership || "STANDARD";
      if (username) username.textContent = data.user?.first_name || "Member";
      renderHistory(data.history || []);
      const withdrawal = await call("/withdrawals");
      if (walletBalance) walletBalance.innerHTML = Number(withdrawal.available_balance || 0).toLocaleString() + " <span>KNV</span>";
      renderWithdrawal(withdrawal);
    } catch (error) {
      note(error.message || "Could not load your Kencoin account.");
    }
  };

  window.requestAction = async function(action, body = {}) {
    if (!auth()) return note("Please open Kencoin inside Telegram.");
    try {
      const data = await call("/" + action, body);
      note(data.message || (data.credited ? "Reward credited." : "Request completed."));
      await window.loadKencoinProfile();
    } catch (error) {
      note(error.message || "Request failed.");
    }
  };

  window.watchAd = async function() {
    if (!auth()) return note("Open Kencoin inside Telegram first.");
    const show = window.show_12287936;
    if (typeof show !== "function") return note("Monetag is loading. Try again shortly.");
    const button = document.querySelector('[onclick="watchAd()"]');
    const status = document.getElementById("adstatus");
    if (button) { button.disabled = true; button.textContent = "LOADING AD..."; }
    try {
      const session = await call("/ad/start", {});
      await show({ type: "end", ymid: session.ymid, requestVar: "daily_reward" });
      if (status) status.textContent = "Ad flow ended. Waiting for Monetag's server-side valued-event confirmation.";
      note("Ad finished. The 5 KNV reward is credited only after Monetag confirms a valued event.");
      setTimeout(window.loadKencoinProfile, 5000);
      setTimeout(window.loadKencoinProfile, 15000);
    } catch (error) {
      if (status) status.textContent = "No verified ad event received. Please try again later.";
      note(error.message || "Ad unavailable. No reward was added.");
    } finally {
      if (button) { button.disabled = false; button.textContent = "WATCH REWARDED AD"; }
    }
  };

  window.buyPlan = async function(plan) {
    if (!auth()) return note("Open Kencoin inside Telegram to purchase.");
    if (typeof tg()?.openInvoice !== "function") return note("Telegram invoice checkout is unavailable in this app session.");
    try {
      const data = await call("/payment/create", { plan });
      if (!data.invoice_link) throw new Error("Invoice service did not return an invoice link.");
      tg().openInvoice(data.invoice_link, status => {
        if (status === "paid") {
          note("Payment received. Membership activates after the bot verifies successful_payment.");
          setTimeout(window.loadKencoinProfile, 2500);
          setTimeout(window.loadKencoinProfile, 8000);
        } else if (status === "cancelled") note("Payment cancelled. No membership activated.");
        else if (status === "failed") note("Payment failed. Please try again.");
      });
    } catch (error) {
      note(error.message || "Could not start Telegram Stars checkout.");
    }
  };

  window.invite = async function() {
    const user = tg()?.initDataUnsafe?.user;
    if (!user?.id) return note("Open Kencoin inside Telegram first.");
    const link = "https://t.me/KencoinOfficialBot?start=" + user.id;
    const target = document.getElementById("referralLink");
    if (target) target.textContent = link;
    let count = 0;
    try { count = (await call("/referral/stats")).count || 0; } catch {}
    note("Invite link ready. Verified referrals: " + count + ". No referral KNV reward is enabled.");
    const share = "https://t.me/share/url?url=" + encodeURIComponent(link);
    if (tg()?.openTelegramLink) tg().openTelegramLink(share);
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
  };

  window.addEventListener("load", async () => {
    const startParam = tg()?.initDataUnsafe?.start_param;
    const userId = tg()?.initDataUnsafe?.user?.id;
    if (startParam && userId && /^\d{3,20}$/.test(String(startParam)) && String(startParam) !== String(userId)) {
      try { await call("/referral/register", { referrer_id: String(startParam) }); } catch {}
    }
    const form = document.getElementById("withdrawalForm");
    form?.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = document.getElementById("withdrawalSubmit");
      if (submit) { submit.disabled = true; submit.textContent = "SUBMITTING..."; }
      try {
        const values = new FormData(form);
        await call("/withdrawals", {
          amount: Number(values.get("amount")),
          network: String(values.get("network") || ""),
          wallet_address: String(values.get("wallet_address") || "").trim()
        });
        form.reset();
        note("Withdrawal request submitted for admin review.");
        await window.loadKencoinProfile();
      } catch (error) {
        note(error.message || "Could not submit withdrawal request.");
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = "SUBMIT WITHDRAWAL REQUEST"; }
      }
    });
    await window.loadKencoinProfile();
  });
})();
