import { db, json, addLedger } from "./lib/db.mjs";
const API="https://api.telegram.org/bot";
async function bot(method,body){
 const r=await fetch(API+process.env.BOT_TOKEN+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 const d=await r.json();if(!d.ok)throw new Error(d.description||"Telegram API error");return d.result;
}
export default async req=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const secret=req.headers.get("x-telegram-bot-api-secret-token");
 if(!process.env.TELEGRAM_WEBHOOK_SECRET||secret!==process.env.TELEGRAM_WEBHOOK_SECRET)return json({error:"Forbidden"},403);
 const update=await req.json(), pool=db(), client=await pool.connect();
 try{
  const q=update.pre_checkout_query;
  if(q){
   const p=await client.query("SELECT user_id,stars,status FROM payments WHERE payload=$1",[q.invoice_payload]);
   const valid=p.rowCount===1&&p.rows[0].status==="pending"&&String(q.from.id)===p.rows[0].user_id&&q.currency==="XTR"&&Number(q.total_amount)===Number(p.rows[0].stars);
   await bot("answerPreCheckoutQuery",{pre_checkout_query_id:q.id,ok:valid,...(!valid?{error_message:"Payment details could not be verified. Please try again."}:{})});
   return json({ok:true});
  }
  const m=update.message, sp=m?.successful_payment;
  if(sp){
   await client.query("BEGIN");
   const p=await client.query("SELECT * FROM payments WHERE payload=$1 FOR UPDATE",[sp.invoice_payload]);
   if(p.rowCount===1&&p.rows[0].status==="pending"&&String(m.from.id)===p.rows[0].user_id&&sp.currency==="XTR"&&Number(sp.total_amount)===Number(p.rows[0].stars)){
    const charge=sp.telegram_payment_charge_id;
    const ins=await client.query("UPDATE payments SET status='paid',telegram_charge_id=$2,paid_at=now() WHERE payload=$1 AND status='pending' RETURNING user_id,plan",[sp.invoice_payload,charge]);
    if(ins.rowCount){
     const days=30;
     await client.query("UPDATE users SET membership=$2,membership_expires_at=GREATEST(COALESCE(membership_expires_at,now()),now())+($3 * interval '1 day'),updated_at=now() WHERE telegram_id=$1",[ins.rows[0].user_id,ins.rows[0].plan,days]);
    }
   }
   await client.query("COMMIT");
  }
  return json({ok:true});
 }catch(e){await client.query("ROLLBACK").catch(()=>{});return json({error:e.message},500);}
 finally{client.release();}
};
