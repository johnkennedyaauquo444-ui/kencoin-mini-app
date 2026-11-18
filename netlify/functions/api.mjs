import { randomUUID } from "node:crypto";
import { db, json, telegramUser, ensureUser, addLedger } from "./lib/db.mjs";

const BOT="https://api.telegram.org/bot";
const PLANS={silver:{stars:100,days:30},gold:{stars:250,days:30},diamond:{stars:500,days:30}};
const CHANNEL="@NairaHackerAI_Official";
async function bot(method,body){
  const token=process.env.BOT_TOKEN;
  if(!token)throw new Error("BOT_TOKEN is not configured");
  const r=await fetch(BOT+token+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const d=await r.json(); if(!d.ok)throw new Error(d.description||"Telegram API error"); return d.result;
}
export default async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS"}});
  const user=await telegramUser(req);
  if(!user?.id)return json({error:"Open Kencoin inside Telegram to continue."},401);
  const url=new URL(req.url), route=url.pathname.replace(/^\/(?:api|\.netlify\/functions\/api)\/?/,"").replace(/\/$/,"");
  const pool=db(), client=await pool.connect();
  try{
    await client.query("BEGIN"); await ensureUser(client,user);
    if(req.method==="GET"&&route==="me"){
      const u=await client.query("SELECT telegram_id,balance,membership,membership_expires_at FROM users WHERE telegram_id=$1",[String(user.id)]);
      const hist=await client.query("SELECT amount,entry_type,description,created_at FROM ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",[String(user.id)]);
      await client.query("COMMIT");return json({user:u.rows[0],history:hist.rows,usd_equivalent:(Number(u.rows[0].balance)/100).toFixed(2)});
    }
    if(req.method!=="POST"){await client.query("ROLLBACK");return json({error:"Method not allowed"},405);}
    const body=await req.json().catch(()=>({}));
    if(route==="daily_bonus"){
      const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      const ok=await addLedger(client,{userId:user.id,amount:3,type:"daily_bonus",reference:"daily:"+user.id+":"+day,description:"Daily bonus"});
      const b=await client.query("SELECT balance FROM users WHERE telegram_id=$1",[String(user.id)]);
      await client.query("COMMIT");return json({ok,credited:ok?3:0,balance:Number(b.rows[0].balance),message:ok?"3 KNV daily bonus credited.":"Today's daily bonus has already been claimed."});
    }
    if(route==="ad/start"){
      const ymid="kc_"+user.id+"_"+randomUUID().replace(/-/g,"");
      await client.query("INSERT INTO ad_shows(ymid,user_id,zone_id,status) VALUES($1,$2,'12287936','pending')",[ymid,String(user.id)]);
      await client.query("COMMIT");return json({ymid});
    }
    if(route==="task/channel"){
      const member=await bot("getChatMember",{chat_id:CHANNEL,user_id:user.id});
      if(!["member","administrator","creator"].includes(member.status)){await client.query("ROLLBACK");return json({error:"Join the official channel first, then verify again."},403);}
      const ok=await addLedger(client,{userId:user.id,amount:10,type:"channel_task",reference:"channel:"+user.id,description:"Verified official Telegram channel join"});
      const b=await client.query("SELECT balance FROM users WHERE telegram_id=$1",[String(user.id)]);
      await client.query("COMMIT");return json({ok,credited:ok?10:0,balance:Number(b.rows[0].balance),message:ok?"10 KNV channel task credited.":"Channel task already claimed."});
    }
    if(route==="payment/create"){
      const plan=PLANS[body.plan];if(!plan){await client.query("ROLLBACK");return json({error:"Invalid membership plan."},400);}
      const payload="kc_"+body.plan+"_"+user.id+"_"+randomUUID().replace(/-/g,"");
      const invoice=await bot("createInvoiceLink",{title:"Kencoin "+body.plan.toUpperCase()+" Membership",description:body.plan+" membership for 30 days",payload,currency:"XTR",prices:[{label:body.plan+" membership",amount:plan.stars}],provider_token:""});
      await client.query("INSERT INTO payments(payload,user_id,plan,stars,status) VALUES($1,$2,$3,$4,'pending')",[payload,String(user.id),body.plan,plan.stars]);
      await client.query("COMMIT");return json({invoice_link:invoice});
    }
    await client.query("ROLLBACK");return json({error:"Unknown API action: "+route},404);
  }catch(e){await client.query("ROLLBACK").catch(()=>{});return json({error:e.message||"Server error"},500);}
  finally{client.release();}
};
