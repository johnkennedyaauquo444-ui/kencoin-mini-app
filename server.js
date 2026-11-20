const express = require("express");
const crypto = require("crypto");
const multer = require("multer");

const app = express();
app.use(express.json({limit:"2mb"}));
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}});
const BOT_TOKEN = process.env.BOT_TOKEN;
const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_BASE_URL = "https://apihub.agnes-ai.com";
const VIDEO_MODEL = "agnes-video-2.5-flash";
const PORT = process.env.PORT || 3000;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN environment variable is required");

// In-memory job ownership is suitable only for a single running instance.
// Use a persistent database before scaling or deploying multiple instances.
const ownedJobs = new Map();

function verifyTelegram(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()].sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>`${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256","WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256",secret).update(dataCheck).digest("hex");
  const a=Buffer.from(hash,"hex"), b=Buffer.from(calculated,"hex");
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
  const authDate=Number(params.get("auth_date"));
  if(!authDate || Date.now()/1000-authDate>3600 || authDate>Date.now()/1000+60) return null;
  try{return JSON.parse(params.get("user"));}catch{return null;}
}
function authenticated(req,res,next){
  const h=req.headers.authorization||"";
  const user=verifyTelegram(h.startsWith("tma ")?h.slice(4):"");
  if(!user)return res.status(401).json({error:"Open VIDEO FACTORY AI inside Telegram and try again."});
  req.user=user;next();
}
async function agnesRequest(path,options={}){
  const response=await fetch(AGNES_BASE_URL+path,{
    ...options,
    headers:{
      Authorization:`Bearer ${AGNES_API_KEY}`,
      ...(options.body?{"Content-Type":"application/json"}:{}),
      ...(options.headers||{})
    },
    signal:AbortSignal.timeout(60000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) {
    const message=data.message||data.error||data.code||"Agnes API request failed.";
    const error=new Error(message);error.status=response.status;throw error;
  }
  return data;
}
app.get("/api/health",(req,res)=>res.json({
  status:"online",app:"VIDEO FACTORY AI",
  video_provider:"Agnes AI",video_provider_configured:Boolean(AGNES_API_KEY),
  model:VIDEO_MODEL
}));

app.post("/api/video/generate",authenticated,upload.single("image"),async(req,res)=>{
  const prompt=String(req.body.prompt||"").trim();
  const mode=String(req.body.mode||"text");
  const ratio=String(req.body.aspect_ratio||"9:16");
  const seconds=String(req.body.duration||"5");
  if(prompt.length<8||prompt.length>1800)return res.status(400).json({error:"Prompt must be between 8 and 1,800 characters."});
  if(!["text","image"].includes(mode))return res.status(400).json({error:"Unsupported generation mode."});
  if(!["9:16","16:9","1:1"].includes(ratio))return res.status(400).json({error:"Unsupported aspect ratio."});
  if(!["5","8","10"].includes(seconds))return res.status(400).json({error:"Unsupported duration."});
  if(mode==="image"&&!req.file)return res.status(400).json({error:"Choose an image first."});
  if(!AGNES_API_KEY)return res.status(503).json({error:"Agnes API key is not configured on the server. No video was generated."});
  try{
    const payload={model:VIDEO_MODEL,prompt,mode:mode==="image"?"keyframe":"text",seconds,size:"720P",aspect_ratio:ratio,n:1};
    if(mode==="image"){
      if(!["image/jpeg","image/png","image/webp"].includes(req.file.mimetype))return res.status(400).json({error:"Use a JPG, PNG or WEBP image."});
      payload.first_frame=`data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }
    const data=await agnesRequest("/v1/videos",{method:"POST",body:JSON.stringify(payload)});
    const videoId=data.video_id||data.id;
    if(!videoId)return res.status(502).json({error:"Agnes did not return a video_id."});
    ownedJobs.set(String(videoId),{userId:String(req.user.id),model:VIDEO_MODEL,createdAt:Date.now()});
    res.status(202).json({id:String(videoId),status:data.status||"queued"});
  }catch(error){
    console.error("Agnes create error:",error.message);
    const busy=error.status===503;
    res.status(502).json({error:busy?"Agnes video service is busy. Please try again later.":error.message});
  }
});

app.get("/api/video/status/:videoId",authenticated,async(req,res)=>{
  const job=ownedJobs.get(req.params.videoId);
  if(!job||job.userId!==String(req.user.id))return res.status(404).json({error:"Video job not found for this Telegram account."});
  if(!AGNES_API_KEY)return res.status(503).json({error:"Agnes API key is not configured."});
  try{
    const q=new URLSearchParams({video_id:req.params.videoId,model_name:job.model});
    const data=await agnesRequest("/agnesapi?"+q.toString());
    const status=String(data.status||"processing").toLowerCase();
    res.json({id:req.params.videoId,status,progress:data.progress??null,url:status==="completed"?(data.url||null):null,error:status==="failed"?(data.error||"Video generation failed."):null});
  }catch(error){
    console.error("Agnes status error:",error.message);
    res.status(502).json({error:error.message||"Could not check video status."});
  }
});
app.listen(PORT,()=>console.log(`VIDEO FACTORY AI listening on ${PORT}`));
