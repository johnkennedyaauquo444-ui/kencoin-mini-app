# VIDEO FACTORY AI

This repository has been rebranded from the Kencoin Mini App into VIDEO FACTORY AI.

## Current state
- Responsive Telegram Mini App interface for text-to-video and image-to-video.
- Prompt, aspect ratio, duration, upload and history UI.
- Telegram Mini App initData verification on the backend.
- Secure server-side video-provider adapter endpoint.
- No video API key or Telegram bot token is exposed in frontend code.

## Required environment variables
- `BOT_TOKEN`: Telegram bot token used by this Mini App.
- `VIDEO_API_URL`: provider generation endpoint implementing the contract below.
- `VIDEO_API_KEY`: provider API key.

## Video provider adapter contract
The server sends a JSON POST request to `VIDEO_API_URL` with a Bearer token and:
```json
{
  "prompt": "A cinematic scene...",
  "mode": "text",
  "aspect_ratio": "9:16",
  "duration_seconds": 5,
  "image": null,
  "telegram_user_id": 123456
}
```
For image-to-video, `image` contains `mime_type` and `data_base64`.
The provider must return JSON with an `id` and optional `status`.
The provider-specific API format must be adapted before enabling a real provider. Do not assume every provider uses this contract.

## Important
The interface can be previewed, but actual generation will return a clear setup message until a compatible provider endpoint and key are configured. The current adapter submits jobs; job polling, MP4 delivery to Telegram, durable job storage, and provider-specific integration remain to be implemented.
