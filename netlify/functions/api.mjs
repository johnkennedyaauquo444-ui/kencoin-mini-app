import { dataStore, json, telegramUser, userRecord, putOnce, getJSON, listJSON, balanceFor, ledgerFor, newId } from "./lib/db.mjs";
const BOT="https://api.telegram.org/bot";
const PLANS={silver:{stars:100,days:30},gold:{stars:250,days:30},diamond:{stars:500,days:30}};
const CHANNEL="@NairaHackerAI_Official";
async function bot(method,body){
 const token=process.env.BOT_TOKEN;if(!token)throw new Error("BOT_TOKEN is not configured");
 const r=await fetch(BOT+token+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 const d=await r.json();if(!d.ok)throw new Error(d.description||"Telegram API error");return d.result;
}
export default async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204});
 const user=await telegramUser(req);if(!user?.id)return json({error:"Open Kencoin inside Telegram to continue."},401);
 const url=new URL(req.url),route=url.pathname.replace(/^\/(?:api|\.netlify\/functions\/api)\/?/,"").replace(/\/$/,"");
 try{
  await userRecord(user);
  if(req.method==="GET"&&route==="me"){
   const [balance,history,paid]=await Promise.all([balanceFor(user.id),ledgerFor(user.id),listJSON("paid/"+user.id+"/")]);
   const active=paid.map(x=>x.value).sort((a,b)=>new Date(b.paid_at)-new Date(a.paid_at))[0];
   const membership=active&&new Date(active.expires_at)>new Date()?active.plan.toUpperCase():"STANDARD";
   return json({user:{telegram_id:String(user.id),balance,membership,membership_expires_at:active?.expires_at||null},history,usd_equivalent:(balance/100).toFixed(2)});
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const body=await req.json().catch(()=>({}));
  if(route==="daily_bonus"){
   const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   const ok=await putOnce("ledger/"+user.id+"/daily-"+day,{user_id:String(user.id),amount:3,entry_type:"daily_bonus",reference:"daily-"+day,description:"Daily bonus",created_at:new Date().toISOString()});
   const balance=await balanceFor(user.id);
   return json({ok:ok.modified,credited:ok.modified?3:0,balance,message:ok.modified?"3 KNV daily bonus credited.":"Today's daily bonus has already been claimed."});
  }
  if(route==="ad/start"){
   const ymid="kc_"+user.id+"_"+newId();
   await dataStore().setJSON("adshows/"+ymid,{ymid,user_id:String(user.id),zone_id:"12287936",created_at:new Date().toISOString()},{onlyIfNew:true});
   return json({ymid});
  }
  if(route==="task/channel"){
   const member=await bot("getChatMember",{chat_id:CHANNEL,user_id:user.id});
   if(!["member","administrator","creator"].includes(member.status))return json({error:"Join the official channel first, then verify again."},403);
   const ok=await putOnce("ledger/"+user.id+"/channel-join",{user_id:String(user.id),amount:10,entry_type:"channel_task",reference:"channel-join",description:"Verified official Telegram channel join",created_at:new Date().toISOString()});
   const balance=await balanceFor(user.id);
   return json({ok:ok.modified,credited:ok.modified?10:0,balance,message:ok.modified?"10 KNV channel task credited.":"Channel task already claimed."});
  }
  if(route==="payment/create"){
   const plan=PLANS[body.plan];if(!plan)return json({error:"Invalid membership plan."},400);
   const payload="kc_"+body.plan+"_"+user.id+"_"+newId();
   const invoice=await bot("createInvoiceLink",{title:"Kencoin "+body.plan.toUpperCase()+" Membership",description:body.plan+" membership for 30 days",payload,currency:"XTR",prices:[{label:body.plan+" membership",amount:plan.stars}],provider_token:""});
   await dataStore().setJSON("invoices/"+payload,{payload,user_id:String(user.id),plan:body.plan,stars:plan.stars,status:"pending",created_at:new Date().toISOString()},{onlyIfNew:true});
   return json({invoice_link:invoice});
  }
  return json({error:"Unknown API action: "+route},404);
 }catch(e){return json({error:e.message||"Server error"},500);}
};
