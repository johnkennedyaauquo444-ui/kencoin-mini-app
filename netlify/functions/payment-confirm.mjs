import { dataStore, getJSON, putOnce, listJSON, json } from "./lib/db.mjs";
export default async req=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const expected=process.env.PAYMENT_CONFIRM_SECRET||"";
 const supplied=req.headers.get("x-kencoin-payment-secret")||"";
 if(!expected||supplied.length!==expected.length)return json({error:"Forbidden"},403);
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^supplied.charCodeAt(i);
 if(diff)return json({error:"Forbidden"},403);
 try{
  const b=await req.json(),payload=String(b.payload||""),userId=String(b.user_id||"");
  const invoice=await getJSON("invoices/"+payload);
  if(!invoice||invoice.user_id!==userId)return json({error:"Unknown invoice or user mismatch"},404);
  if(b.currency!=="XTR"||Number(b.total_amount)!==Number(invoice.stars)||!b.telegram_charge_id)return json({error:"Payment amount, currency or charge ID mismatch"},400);
  const previous=await listJSON("paid/"+userId+"/");
  const now=new Date();
  const latestExpiry=previous.reduce((max,x)=>Math.max(max,new Date(x.value.expires_at).getTime()||0),0);
  const base=Math.max(now.getTime(),latestExpiry);
  const paidAt=now.toISOString(),expiresAt=new Date(base+30*86400000).toISOString();
  const record={user_id:userId,plan:invoice.plan,stars:invoice.stars,telegram_charge_id:String(b.telegram_charge_id),paid_at:paidAt,expires_at:expiresAt,payload};
  const saved=await putOnce("paid/"+userId+"/"+payload,record);
  if(!saved.modified){
   const existing=await getJSON("paid/"+userId+"/"+payload);
   return json({ok:true,duplicate:true,membership:existing?.plan||invoice.plan,expires_at:existing?.expires_at||null});
  }
  await dataStore().setJSON("payments/"+payload,{...invoice,status:"paid",paid_at:paidAt,telegram_charge_id:String(b.telegram_charge_id)});
  return json({ok:true,duplicate:false,membership:invoice.plan,expires_at:expiresAt});
 }catch(e){return json({error:e.message||"Payment confirmation failed"},500);}
};
