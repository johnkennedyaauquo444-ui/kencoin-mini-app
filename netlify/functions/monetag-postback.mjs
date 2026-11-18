import { db } from "./lib/db.mjs";
const ZONE="12287936", REWARD=5;
export default async req=>{
 const q=new URL(req.url).searchParams, expected=process.env.POSTBACK_SECRET||"", supplied=q.get("secret")||"";
 if(!expected||supplied.length!==expected.length)return new Response("Forbidden",{status:403});
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^supplied.charCodeAt(i);
 if(diff)return new Response("Forbidden",{status:403});
 const ymid=q.get("ymid")||"",zone=q.get("zone_id")||"",event=q.get("event_type")||"",reward=q.get("reward_event_type")||"",telegramId=q.get("telegram_id")||"";
 if(!/^[A-Za-z0-9_.-]{1,180}$/.test(ymid)||zone!==ZONE||event!=="impression")return new Response("Invalid event",{status:400});
 if(reward==="non_valued")return new Response("Unpaid event ignored",{status:200});
 if(reward!=="valued")return new Response("Unknown reward event",{status:400});
 const client=await db().connect();
 try{
  await client.query("BEGIN");
  const ad=await client.query("SELECT user_id FROM ad_shows WHERE ymid=$1 AND zone_id=$2 FOR UPDATE",[ymid,ZONE]);
  if(!ad.rowCount){await client.query("ROLLBACK");return new Response("Unknown ad show",{status:404});}
  const uid=ad.rows[0].user_id;
  if(telegramId&&telegramId!==uid){await client.query("ROLLBACK");return new Response("User mismatch",{status:403});}
  const ins=await client.query("INSERT INTO ad_rewards(ymid,user_id,estimated_price) VALUES($1,$2,$3) ON CONFLICT(ymid) DO NOTHING RETURNING ymid",[ymid,uid,q.get("estimated_price")||"0"]);
  if(ins.rowCount){
   await client.query("INSERT INTO ledger(user_id,amount,entry_type,reference,description) VALUES($1,$2,'monetag_reward',$3,'Verified Monetag rewarded ad') ON CONFLICT(reference) DO NOTHING",[uid,REWARD,"monetag:"+ymid]);
   await client.query("UPDATE users SET balance=balance+$2,updated_at=now() WHERE telegram_id=$1",[uid]);
   await client.query("UPDATE ad_shows SET status='rewarded' WHERE ymid=$1",[ymid]);
  }
  await client.query("COMMIT");return new Response(ins.rowCount?"Reward credited":"Duplicate ignored",{status:200});
 }catch(e){await client.query("ROLLBACK").catch(()=>{});return new Response("Server error",{status:500});}
 finally{client.release();}
};