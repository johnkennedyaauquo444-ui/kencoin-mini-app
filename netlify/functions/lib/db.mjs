import pg from "pg";
const { Pool } = pg;
let pool;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000 });
  return pool;
}
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
export async function telegramUser(req){
  const auth=req.headers.get("authorization")||"";
  const initData=auth.startsWith("tma ")?auth.slice(4):"";
  const token=process.env.BOT_TOKEN;
  if(!initData||!token)return null;
  const p=new URLSearchParams(initData), hash=p.get("hash");
  if(!hash)return null;
  p.delete("hash");
  const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");
  const crypto=await import("node:crypto");
  const secret=crypto.createHmac("sha256","WebAppData").update(token).digest();
  const calc=crypto.createHmac("sha256",secret).update(check).digest("hex");
  const a=Buffer.from(hash,"hex"),b=Buffer.from(calc,"hex");
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  const authDate=Number(p.get("auth_date"));
  if(!authDate||Date.now()/1000-authDate>86400||authDate>Date.now()/1000+60)return null;
  try{return JSON.parse(p.get("user")||"null");}catch{return null;}
}
export async function ensureUser(client,user){
  await client.query("INSERT INTO users(telegram_id,username,first_name,last_name) VALUES($1,$2,$3,$4) ON CONFLICT(telegram_id) DO UPDATE SET username=EXCLUDED.username, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, updated_at=now()",[String(user.id),user.username||null,user.first_name||null,user.last_name||null]);
}
export async function addLedger(client,{userId,amount,type,reference,description}){
  const ins=await client.query("INSERT INTO ledger(user_id,amount,entry_type,reference,description) VALUES($1,$2,$3,$4,$5) ON CONFLICT(reference) DO NOTHING RETURNING id",[String(userId),amount,type,reference,description||null]);
  if(ins.rowCount) await client.query("UPDATE users SET balance=balance+$2,updated_at=now() WHERE telegram_id=$1",[String(userId),amount]);
  return ins.rowCount===1;
}
