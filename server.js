const express = require("express");
const crypto = require("crypto");
const multer = require("multer");

const app = express();
app.use(express.json({ limit: "2mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const VIDEO_API_URL = process.env.VIDEO_API_URL;
const VIDEO_API_KEY = process.env.VIDEO_API_KEY;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN environment variable is required");

function verifyTelegram(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()].sort(([a],[b]) => a.localeCompare(b))
    .map(([key,value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256","WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256",secret).update(dataCheck).digest("hex");
  const a = Buffer.from(hash,"hex"), b = Buffer.from(calculated,"hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now()/1000-authDate > 3600 || authDate > Date.now()/1000+60) return null;
  try { return JSON.parse(params.get("user")); } catch { return null; }
}
function authenticated(req,res,next) {
  const header = req.headers.authorization || "";
  const user = verifyTelegram(header.startsWith("tma ") ? header.slice(4) : "");
  if (!user) return res.status(401).json({error:"Open the Mini App from Telegram and try again."});
  req.user = user;
  next();
}
app.get("/api/health",(req,res)=>res.json({
  status:"online", app:"VIDEO FACTORY AI",
  video_provider_configured:Boolean(VIDEO_API_URL && VIDEO_API_KEY)
}));

// Provider adapter contract: configure VIDEO_API_URL and VIDEO_API_KEY.
// The provider endpoint must accept JSON {prompt, mode, aspect_ratio, duration_seconds, image:{mime_type,data_base64}|null}
// with Authorization: Bearer <key>, and return JSON containing at least {id,status}.
app.post("/api/video/generate",authenticated,upload.single("image"),async(req,res)=>{
  const prompt=String(req.body.prompt||"").trim();
  const mode=String(req.body.mode||"text");
  const ratio=String(req.body.aspect_ratio||"9:16");
  const duration=Number(req.body.duration||5);
  if(prompt.length<8 || prompt.length>1800) return res.status(400).json({error:"Prompt must be between 8 and 1,800 characters."});
  if(!["text","image"].includes(mode)) return res.status(400).json({error:"Unsupported generation mode."});
  if(!["9:16","16:9","1:1"].includes(ratio)) return res.status(400).json({error:"Unsupported aspect ratio."});
  if(![5,8,10].includes(duration)) return res.status(400).json({error:"Unsupported video duration."});
  if(mode==="image" && !req.file) return res.status(400).json({error:"An image is required for image-to-video."});
  if(!VIDEO_API_URL || !VIDEO_API_KEY) return res.status(503).json({error:"Video generation provider is not connected yet. No credits or payment were used."});
  try {
    const payload={prompt,mode,aspect_ratio:ratio,duration_seconds:duration,image:req.file?{
      mime_type:req.file.mimetype,data_base64:req.file.buffer.toString("base64")
    }:null,telegram_user_id:req.user.id};
    const upstream=await fetch(VIDEO_API_URL,{
      method:"POST",headers:{"Authorization":`Bearer ${VIDEO_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)
    });
    const data=await upstream.json().catch(()=>({}));
    if(!upstream.ok) return res.status(502).json({error:data.error||data.message||"Video provider rejected the request."});
    if(!data.id) return res.status(502).json({error:"Provider response is missing a job id. Check the provider adapter."});
    return res.status(202).json({id:String(data.id),status:data.status||"queued"});
  } catch(error) {
    console.error("Video provider error:",error.message);
    return res.status(502).json({error:"Could not reach the video provider. Try again later."});
  }
});
app.listen(PORT,()=>console.log(`VIDEO FACTORY AI backend listening on ${PORT}`));
