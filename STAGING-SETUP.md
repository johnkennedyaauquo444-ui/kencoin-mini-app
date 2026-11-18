# Kencoin staging setup

## Required Netlify environment variables
- BOT_TOKEN: token for @KencoinOfficialBot. Keep private; never put it in frontend code.
- POSTBACK_SECRET: create a long random secret. Keep it private and use it in Monetag's postback URL.
- TELEGRAM_WEBHOOK_SECRET: a different long random secret for Telegram webhook verification.

The app uses Netlify Blobs as an append-only event ledger. It does not need a separate database or a DATABASE_URL. Each reward is written once under a unique key; the wallet balance is calculated by summing immutable ledger entries rather than incrementing a shared counter.

## Telegram payment webhook
The endpoint is /telegram-webhook. Telegram must send updates there with the TELEGRAM_WEBHOOK_SECRET header. IMPORTANT: Telegram allows only one webhook URL per bot. Changing it will replace the current webhook. If @KencoinOfficialBot is currently connected to Telebot Creator, do not replace its webhook until its commands and existing payment handlers have been migrated or a supported forwarding setup is confirmed. Otherwise existing bot commands may stop working.

The bot must be an administrator in @NairaHackerAI_Official for reliable channel membership verification.

## Monetag postback
Set this URL in the Monetag dashboard, replacing the domain and secret:
https://YOUR-NETLIFY-SITE.netlify.app/monetag-postback?secret=YOUR_POSTBACK_SECRET&ymid={ymid}&zone_id={zone_id}&event_type={event_type}&reward_event_type={reward_event_type}&telegram_id={telegram_id}&estimated_price={estimated_price}

Use Monetag's macro placeholders exactly. The server rewards only valued impressions, and each ymid is credited once.

## Approved settings
- Daily bonus: 3 KNV
- Verified channel join: 10 KNV
- Verified Monetag valued rewarded ad: 5 KNV
- Display conversion: 1 KNV = $0.01 (display estimate only; not a guarantee of redeemable cash)
- Silver: 100 Telegram Stars / 30 days
- Gold: 250 Telegram Stars / 30 days
- Diamond: 500 Telegram Stars / 30 days
- Withdrawal UI remains WITHDRAWAL LOCKED and does not accept requests while locked.
- Referral link is wired to @KencoinOfficialBot; referral reward amount is not yet approved, so no referral coins are granted.

## Before final deploy
Test inside Telegram: authenticated profile, daily bonus once per Lagos calendar day, channel verification, one valued Monetag ad credited once, non-valued ad ignored, Telegram Stars invoice + pre-checkout + successful payment + VIP expiry, referral link, and withdrawal lock. Do not merge this staging branch into main until all tests pass.
