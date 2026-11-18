import crypto from "node:crypto";

const supabaseUrl = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function dbRequest(path, options = {}) {
  const url = supabaseUrl(), key = supabaseKey();
  if (!url || !key) throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY in Netlify.");
  const response = await fetch(url + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) {
    const message = data && typeof data === "object" ? (data.message || data.details || data.hint || data.code) : data;
    throw new Error(message || "Database request failed (" + response.status + ")");
  }
  return data;
}
export async function rpc(name, args) {
  return dbRequest("rpc/" + encodeURIComponent(name), { method: "POST", body: JSON.stringify(args) });
}
export async function selectRows(table, query = "") {
  return dbRequest(table + (query ? "?" + query : ""), { method: "GET" });
}
export async function insertRow(table, value, query = "", prefer = "return=representation") {
  return dbRequest(table + (query ? "?" + query : ""), { method: "POST", body: JSON.stringify(value), headers: { Prefer: prefer } });
}
export async function upsertRow(table, value, conflict) {
  return dbRequest(table + "?on_conflict=" + encodeURIComponent(conflict), {
    method: "POST", body: JSON.stringify(value),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" }
  });
}
export async function updateRows(table, query, value) {
  return dbRequest(table + "?" + query, { method: "PATCH", body: JSON.stringify(value), headers: { Prefer: "return=representation" } });
}
export async function telegramUser(req) {
  const auth = req.headers.get("authorization") || "";
  const initData = auth.startsWith("tma ") ? auth.slice(4) : "";
  const token = process.env.BOT_TOKEN;
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => k + "=" + v).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calculated = crypto.createHmac("sha256", secret).update(check).digest("hex");
  const a = Buffer.from(hash, "hex"), b = Buffer.from(calculated, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  const authDate = Number(params.get("auth_date"));
  const age = Date.now()/1000 - authDate;
  if (!authDate || age > 3600 || age < -60) return null;
  try {
    const user = JSON.parse(params.get("user") || "null");
    if (!user || !/^\d{3,20}$/.test(String(user.id))) return null;
    return { ...user, start_param: params.get("start_param") || null };
  } catch { return null; }
}
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
export function newId() { return crypto.randomUUID().replace(/-/g, ""); }
export function sameSecret(expected, supplied) {
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return crypto.timingSafeEqual(a,b);
}
