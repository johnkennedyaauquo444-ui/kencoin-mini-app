# VIDEO FACTORY AI

Telegram Mini App frontend and Netlify Functions backend using Agnes Video 2.5 Flash.

## Deploy
Connect this GitHub repository to Netlify. Netlify builds the static Mini App from `public/` and deploys the functions from `netlify/functions/`.

## Required Netlify environment variables
Set both variables in Netlify site environment settings, with Functions runtime scope:
- `BOT_TOKEN`: Telegram bot token for the Mini App.
- `AGNES_API_KEY`: a fresh Agnes Platform API key. Never commit this key to GitHub or put it in browser code.

Redeploy after setting or changing environment variables.

## API routes
- `POST /api/video/generate`
- `GET /api/video/status/:videoId`

Telegram Mini App initData is validated server-side. Job tokens are signed and tied to the Telegram user, so this serverless version does not depend on an in-memory job map.

## Agnes
- Create: `POST https://apihub.agnes-ai.com/v1/videos`
- Model: `agnes-video-2.5-flash`
- Poll: `GET https://apihub.agnes-ai.com/agnesapi?video_id=...&model_name=agnes-video-2.5-flash`
- Auth: `Authorization: Bearer $AGNES_API_KEY`

The frontend checks status while the Mini App remains open. Completed MP4s are shown in the Mini App; automatic Telegram chat delivery is not implemented. Netlify Functions have execution and payload limits, so large image uploads and long-running synchronous work are intentionally avoided. Provider quota, pricing and availability can change.
