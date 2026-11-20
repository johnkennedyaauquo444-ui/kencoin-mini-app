# VIDEO FACTORY AI

Telegram Mini App frontend and Node.js backend using Agnes Video 2.5 Flash.

## Features in this build
- Text-to-video and image-to-video UI.
- Vertical, landscape and square aspect ratios.
- 5, 8 and 10 second options.
- Telegram Mini App authentication verification.
- Server-side Agnes video task creation and status polling.
- Completed MP4 preview/link in the Mini App.

## Hosting environment variables
Set these in your hosting provider's secret/environment-variable settings:
- `BOT_TOKEN`: Telegram bot token for the Mini App.
- `AGNES_API_KEY`: Agnes Platform API key. Never put it in frontend code or commit it to GitHub.

After adding/changing environment variables, redeploy the service.

## Agnes integration
- Create: `POST https://apihub.agnes-ai.com/v1/videos`
- Model: `agnes-video-2.5-flash`
- Poll: `GET https://apihub.agnes-ai.com/agnesapi?video_id=...&model_name=agnes-video-2.5-flash`
- Auth: `Authorization: Bearer $AGNES_API_KEY`

The current backend uses the Agnes Video 2.5 request format and checks the returned top-level status and URL. Flash is 720P. Provider quota, availability and pricing can change; check your Agnes Platform console before production use.

## Important limitations
- Video jobs are currently tracked in process memory. Restarting the server loses the job-to-user lookup; use a persistent database before scaling or relying on long-running history.
- The Mini App polls while it remains open. A background worker and persistent job storage are needed for reliable delivery when users close the app.
- Completed MP4s are previewed/linked in the Mini App; automatic Telegram chat delivery is not implemented yet.
- Image-to-video uses the uploaded image as the first keyframe.
