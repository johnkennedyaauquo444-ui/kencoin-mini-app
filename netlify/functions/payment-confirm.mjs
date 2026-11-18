import { dataStore, getJSON, getWithMetadata, putOnce, listJSON, json } from "./lib/db.mjs";
export default async req=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const expected=process.env.PAYMENT_CONFIRM_SECRET||"",supplied=req.headers.get("x-kencoin-payment-secret")||"";
 if(!expected||supplied.length!==expected.length)return json({error:"Forbidden"},403);
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^supplied.charCodeAt(i);
 if(diff)return json({error:"Forbidden"},403);
 try{
  const b=await req.json(),payload=String(b.payload||""),userId=String(b.user_id||""),charge=String(b.telegram_charge_id||"");
  if(!/^kc_(silver|gold|diamond)_\d{3,20}_[A-Za-z0-9]+$/.test(payload)||!/^\d{3,20}$/.test(userId)||!charge||charge.length>256)return json({error:"Invalid payment reference"},400);
  const invoiceEntry=await getWithMetadata("invoices/"+payload);
  if(!invoiceEntry)return json({error:"Unknown invoice"},404);
  const invoice=invoiceEntry.data;
  if(invoice.user_id!==userId)return json({error:"Invoice user mismatch"},403);
  if(b.currency!=="XTR"||Number(b.total_amount)!==Number(invoice.stars))return json({error:"Payment amount or currency mismatch"},400);
  const chargeKey="charges/"+Buffer.from(charge).toString("base64url");
  const chargeResult=await putOnce(chargeKey,{charge_id:charge,payload,user_id:userId,created_at:new Date().toISOString()});
  if(!chargeResult.modified){
   const prior=await getJSON(chargeKey);
   if(prior?.payload!==payload||prior?.user_id!==userId)return json({error:"Telegram charge ID has already been used"},409);
  }
  if(invoice.status==="paid"){
   if(invoice.telegram_charge_id!==charge)return json({error:"This invoice has already been paid with another charge"},409);
   return json({ok:true,duplicate:true,membership:invoice.plan,expires_at:invoice.expires_at});
  }
  if(invoice.status!=="pending")return json({error:"Invoice is not payable"},409);
  const previous=await listJSON("invoices/");
  const latestExpiry=previous.filter(x=>x.value.user_id===userId&&x.value.status==="paid").reduce((max,x)=>Math.max(max,Date.parse(x.value.expires_at)||0),0);
  const now=new Date(),base=Math.max(now.getTime(),latestExpiry),expiresAt=new Date(base+30*86400000).toISOString();
  const paid={...invoice,status:"paid",telegram_charge_id:charge,paid_at:now.toISOString(),expires_at:expiresAt};
  const saved=await dataStore().setJSON("invoices/"+payload,paid,{onlyIfMatch:invoiceEntry.etag});
  if(!saved.modified){
   const current=await getJSON("invoices/"+payload);
   if(current?.status==="paid"&&current.telegram_charge_id===charge)return json({ok:true,duplicate:true,membership:current.plan,expires_at:current.expires_at});
   return json({error:"Invoice was confirmed by another payment request"},409);
  }
  return json({ok:true,duplicate:false,membership:invoice.plan,expires_at:expiresAt});
 }catch(e){return json({error:e.message||"Payment confirmation failed"},500);}
};
