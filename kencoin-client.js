(() => {
  const api = "/api";
  const auth = () => window.Telegram?.WebApp?.initData || "";
  const tg = () => window.Telegram?.WebApp;
  const note = (s) => window.notify ? window.notify(s) : alert(s);
  async function call(path, body) {
    const r = await fetch(api + path, {method: body === undefined ? "GET" : "POST", headers: {"Authorization":"tma "+auth(), ...(body === undefined ? {} : {"Content-Type":"application/json"})}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    const d = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(d.error || "Request failed");
    return d;
  }
  window.loadKencoinProfile = async function() {
    if (!auth()) return;
    try {
      const d = await call("/me");
      const n = Number(d.user.balance || 0);
      const balance = document.getElementById("balance");
      const wallet = document.getElementById("walletBalance");
      if (balance) balance.innerHTML = n.toLocaleString()+" <span>KNV</span>";
      if (wallet) wallet.innerHTML = n.toLocaleString()+" <span>KNV</span>";
      const usd = document.getElementById("usdBalance");
      if (usd) usd.textContent = "≈ $"+(n/100).toFixed(2);
      const membership = document.getElementById("membership");
      if (membership) membership.textContent = d.user.membership || "STANDARD";
      const history = document.getElementById("historyList");
      if (history) history.textContent = d.history.length ? d.history.map(x => new Date(x.created_at).toLocaleString()+" · "+x.description+" · "+x.amount+" KNV").join("\n") : "No activity yet.";
      const referral = document.getElementById("referralLink");
      if (referral && tg()?.initDataUnsafe?.user?.id) referral.dataset.owner = String(tg().initDataUnsafe.user.id);
    } catch(e) { note(e.message); }
  };
  window.requestAction = async function(action, data={}) {
    if (!auth()) return note("Please open Kencoin inside Telegram.");
    try {
      const d = await call("/"+action, data);
      note(d.message || "Done.");
      await window.loadKencoinProfile();
    } catch(e) { note(e.message); }
  };
  window.watchAd = async function() {
    if (!auth()) return note("Open Kencoin inside Telegram first.");
    const show = window.show_12287936;
    if (typeof show !== "function") return note("Monetag is loading. Try again shortly.");
    const btn = document.querySelector('[onclick="watchAd()"]');
    if (btn) {btn.disabled=true;btn.textContent="LOADING AD...";}
    try {
      const session = await call("/ad/start", {});
      await show({type:"end", ymid:session.ymid, requestVar:"daily_reward"});
      const status=document.getElementById("adstatus");
      if(status)status.textContent="Ad finished. Waiting for Monetag's secure server-side reward confirmation.";
      note("Ad finished. Your 5 KNV is added only after Monetag confirms a valued impression.");
      setTimeout(window.loadKencoinProfile, 5000);
    } catch(e) { note(e.message || "Ad unavailable or verification failed."); }
    finally {if(btn){btn.disabled=false;btn.textContent="WATCH REWARDED AD";}}
  };
  window.buyPlan = async function(plan) {
    if (!auth()) return note("Open Kencoin inside Telegram to purchase.");
    try {
      const d = await call("/payment/create", {plan});
      tg().openInvoice(d.invoice_link, status => {
        if (status === "paid") {note("Payment received. Waiting for verified membership activation...");setTimeout(window.loadKencoinProfile,3000);}
        else if (status === "cancelled") note("Payment cancelled. No membership activated.");
        else if (status === "failed") note("Payment failed. Please try again.");
      });
    } catch(e) {note(e.message);}
  };
  window.invite = async function() {
    const user=tg()?.initDataUnsafe?.user;
    if(!user?.id)return note("Open Kencoin inside Telegram first.");
    const link="https://t.me/KencoinOfficialBot?start="+user.id;
    const target=document.getElementById("referralLink");
    if(target)target.textContent=link;
    try{
      const stats=await call("/referral/stats");
      const count=stats.count||0;
      note("Your invite link is ready. Verified referrals: "+count+". Referral rewards are not enabled yet.");
    }catch(e){note("Your invite link is ready. "+e.message);}
    const share="https://t.me/share/url?url="+encodeURIComponent(link);
    if(tg()?.openTelegramLink)tg().openTelegramLink(share);
    else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);note("Referral link copied.");}
  };
  window.addEventListener("load", async () => {
    const tasks = document.querySelector("#tasks .panel");
    if (tasks && !document.getElementById("verifyChannelTask")) {
      const b = document.createElement("button");
      b.id="verifyChannelTask";b.className="btn secondary";b.textContent="VERIFY CHANNEL JOIN · 10 KNV";
      b.onclick=()=>window.requestAction("task/channel");
      tasks.appendChild(b);
    }
    const startParam=tg()?.initDataUnsafe?.start_param;
    const me=tg()?.initDataUnsafe?.user?.id;
    if(startParam&&me&&/^\d{3,20}$/.test(String(startParam))&&String(startParam)!==String(me)){
      try{await call("/referral/register",{referrer_id:String(startParam)});}catch(e){/* no reward is issued from a referral link alone */}
    }
    window.loadKencoinProfile();
  });
})();
