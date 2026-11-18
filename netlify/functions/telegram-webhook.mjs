import { dataStore, getJSON, putOnce, json } from "./lib/db.mjs";
const API="https://api.telegram.org/bot";
async function bot(method,body){
 const r=await fetch(API+process.env.BOT_TOKEN+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 const d=await r.json();if(!d.ok)throw new Error(d.description||"Telegram API error");return d.result;
}
export default async req=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const secret=req.headers.get("x-telegram-bot-api-secret-token");
 if(!process.env.TELEGRAM_WEBHOOK_SECRET||secret!==process.env.TELEGRAM_WEBHOOK_SECRET)return json({error:"Forbidden"},403);
 try{
  const update=await req.json(),q=update.pre_checkout_query;
  if(q){
   const invoice=await getJSON("invoices/"+q.invoice_payload);
   const valid=invoice&&invoice.status==="pending"&&String(q.from.id)===invoice.user_id&&q.currency==="XTR"&&Number(q.total_amount)===Number(invoice.stars);
   await bot("answerPreCheckoutQuery",{pre_checkout_query_id:q.id,ok:!!valid,...(!valid?{error_message:"Payment details could not be verified. Please try again."}:{})});
   return json({ok:true});
  }
  const m=update.message,sp=m?.successful_payment;
  if(sp){
   const invoice=await getJSON("invoices/"+sp.invoice_payload);
   if(invoice&&String(m.from.id)===invoice.user_id&&sp.currency==="XTR"&&Number(sp.total_amount)===Number(invoice.stars)){
    const paidAt=new Date(),expires=new Date(paidAt.getTime()+30*86400000);
    const record={user_id:invoice.user_id,plan:invoice.plan,stars:invoice.stars,telegram_charge_id:sp.telegram_payment_charge_id,paid_at:paidAt.toISOString(),expires_at:expires.toISOString(),payload:sp.invoice_payload};
    const result=await putOnce("paid/"+invoice.user_id+"/"+sp.invoice_payload,record);
    if(result.modified)await dataStore().setJSON("payments/"+sp.invoice_payload,{...invoice,status:"paid",paid_at:record.paid_at,telegram_charge_id:record.telegram_charge_id});
   }
  }
  return json({ok:true});
 }catch(e){return json({error:e.message||"Webhook error"},500);}
};
