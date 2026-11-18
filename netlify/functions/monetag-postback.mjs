import { dataStore, getJSON, putOnce } from "./lib/db.mjs";
const ZONE="12287936",REWARD=5;
export default async req=>{
 const q=new URL(req.url).searchParams,expected=process.env.POSTBACK_SECRET||"",supplied=q.get("secret")||"";
 if(!expected||supplied.length!==expected.length)return new Response("Forbidden",{status:403});
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^supplied.charCodeAt(i);
 if(diff)return new Response("Forbidden",{status:403});
 const ymid=q.get("ymid")||"",zone=q.get("zone_id")||"",event=q.get("event_type")||"",reward=q.get("reward_event_type")||"",telegramId=q.get("telegram_id")||"";
 if(!/^[A-Za-z0-9_.-]{1,180}$/.test(ymid)||zone!==ZONE||event!=="impression")return new Response("Invalid event",{status:400});
 if(reward==="non_valued")return new Response("Unpaid event ignored",{status:200});
 if(reward!=="valued")return new Response("Unknown reward event",{status:400});
 const ad=await getJSON("adshows/"+ymid);
 if(!ad)return new Response("Unknown ad show",{status:404});
 if(telegramId&&telegramId!==ad.user_id)return new Response("User mismatch",{status:403});
 const result=await putOnce("ledger/"+ad.user_id+"/monetag-"+ymid,{user_id:ad.user_id,amount:REWARD,entry_type:"monetag_reward",reference:"monetag-"+ymid,description:"Verified Monetag rewarded ad",estimated_price:q.get("estimated_price")||"0",created_at:new Date().toISOString()});
 if(result.modified)await dataStore().setJSON("adshows/"+ymid,{...ad,status:"rewarded",verified_at:new Date().toISOString()});
 return new Response(result.modified?"Reward credited":"Duplicate ignored",{status:200});
};
