# Kencoin staging setup (do not deploy until complete)

## Netlify environment variables
Set these in the Kencoin Netlify site's environment variables:
- BOT_TOKEN: the token for @KencoinOfficialBot (never put it in frontend code).
- DATABASE_URL: the PostgreSQL connection string for the Netlify DB attached to this site.
- POSTBACK_SECRET: a long random secret created by you; use the same value in Monetag's postback URL.
- TELEGRAM_WEBHOOK_SECRET: a different long random secret for Telegram webhook verification.

## Database
Create/attach a PostgreSQL database to the Netlify site, then run database/schema.sql once against it. Netlify Blobs must not be used for wallet balances: balances require database transactions.

## Telegram
The Telegram webhook endpoint is /telegram-webhook. Configure Telegram to send bot updates there using the TELEGRAM_WEBHOOK_SECRET header. Important: changing a bot webhook replaces its existing webhook. If @KencoinOfficialBot is currently managed by Telebot Creator, do not change its webhook until its existing commands are migrated or a supported update-forwarding arrangement is confirmed.

The bot must be an administrator in @NairaHackerAI_Official for reliable channel-membership verification.

## Monetag
Configure the zone 12287936 postback URL as:
https://YOUR-NETLIFY-SITE.netlify.app/monetag-postback?secret=YOUR_POSTBACK_SECRET&ymid={ymid}&zone_id={zone_id}&event_type={event_type}&reward_event_type={reward_event_type}&telegram_id={telegram_id}&estimated_price={estimated_price}

Use Monetag's macro placeholders exactly. Reward is credited only for a valued impression, and each ymid is credited once.

## Important
- Silver: 100 Stars / 30 days; Gold: 250 Stars / 30 days; Diamond: 500 Stars / 30 days.
- Daily bonus: 3 KNV; verified channel join: 10 KNV; verified Monetag valued ad: 5 KNV.
- 1 KNV is displayed as $0.01; this display conversion is not a guarantee of cash redemption.
- Withdrawals remain locked in the UI and cannot be submitted while locked.
- Referral link tracking is present in the UI, but referral reward amount has not been approved/configured.
- Never deploy or merge this staging branch until database setup, webhook ownership, postback setup, and end-to-end Telegram tests are complete.
