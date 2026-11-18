import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// Strong read-after-write consistency for the append-only event ledger.
const store = () => getStore({ name: "kencoin-immutable-ledger-v1", consistency: "strong" });
export const dataStore = store;
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
export async function telegramUser(req){
 const auth=req.headers.get("authorization")||"",initData=auth.startsWith("tma ")?auth.slice(4):"",token=process.env.BOT_TOKEN;
 if(!initData||!token)return null;
 const p=new URLSearchParams(initData),hash=p.get("hash");if(!hash)return null;p.delete("hash");
 const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");
 const secret=crypto.createHmac("sha256","WebAppData").update(token).digest();
 const calc=crypto.createHmac("sha256",secret).update(check).digest("hex");
 const a=Buffer.from(hash,"hex"),b=Buffer.from(calc,"hex");
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
 const authDate=Number(p.get("auth_date"));
 if(!authDate||Date.now()/1000-authDate>86400||authDate>Date.now()/1000+60)return null;
 try{return {...JSON.parse(p.get("user")||"null"),start_param:p.get("start_param")||null};}catch{return null;}
}
export async function getJSON(key){return await store().get(key,{type:"json",consistency:"strong"});}
export async function getWithMetadata(key){return await store().getWithMetadata(key,{type:"json",consistency:"strong"});}
export async function putOnce(key,value){return await store().setJSON(key,value,{onlyIfNew:true});}
export async function putIfMatch(key,value,etag){return await store().setJSON(key,value,{onlyIfMatch:etag});}
export async function listJSON(prefix){
 const listed=await store().list({prefix});
 const out=await Promise.all((listed.blobs||[]).map(async b=>({key:b.key,value:await getJSON(b.key)})));
 return out.filter(x=>x.value!==null);
}
export async function userRecord(user){
 await store().setJSON("users/"+user.id,{telegram_id:String(user.id),username:user.username||null,first_name:user.first_name||null,last_name:user.last_name||null,updated_at:new Date().toISOString()});
}
export async function balanceFor(userId){
 const rows=await listJSON("ledger/"+userId+"/");
 return rows.reduce((sum,x)=>sum+Number(x.value.amount||0),0);
}
export async function ledgerFor(userId){
 const rows=await listJSON("ledger/"+userId+"/");
 return rows.map(x=>x.value).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
}
export function newId(){return crypto.randomUUID().replace(/-/g,"");}
