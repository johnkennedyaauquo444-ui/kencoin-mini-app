# Kencoin staging setup

## Netlify environment variables
- BOT_TOKEN: token for @KencoinOfficialBot. Keep it private.
- POSTBACK_SECRET: a long random secret, also configured in Monetag.
- PAYMENT_CONFIRM_SECRET: a different long random secret shared only with the Telebot Creator payment handler.

No separate database is required. The app uses Netlify Blobs as an append-only event ledger: each reward is recorded once under a unique key, and the wallet balance is calculated by summing those immutable entries. It does not use Blobs as a mutable balance counter.

## Monetag
Configure this postback URL in Monetag, replacing the site domain and secret:
https://YOUR-NETLIFY-SITE.netlify.app/monetag-postback?secret=YOUR_POSTBACK_SECRET&ymid={ymid}&zone_id={zone_id}&event_type={event_type}&reward_event_type={reward_event_type}&telegram_id={telegram_id}&estimated_price={estimated_price}

Reward is credited only for a valued impression, and each ymid is credited once. The Mini App registers each ymid with the authenticated Telegram user before calling the SDK.

## Telegram Stars and Telebot Creator
The Mini App creates the invoice link through the Telegram Bot API. Keep @KencoinOfficialBot's webhook managed by Telebot Creator. Do NOT point the bot webhook at Netlify; Telegram supports one webhook per bot, and replacing it can stop existing Telebot Creator commands.

After Telebot Creator receives a successful_payment update, its server-side handler must POST these fields to:
https://YOUR-NETLIFY-SITE.netlify.app/payment-confirm

Headers:
Content-Type: application/json
X-Kencoin-Payment-Secret: YOUR_PAYMENT_CONFIRM_SECRET

JSON body:
{
  "payload": "<successful_payment.invoice_payload>",
  "user_id": "<message.from.id>",
  "currency": "<successful_payment.currency>",
  "total_amount": "<successful_payment.total_amount>",
  "telegram_charge_id": "<successful_payment.telegram_payment_charge_id>"
}

The endpoint validates the pending invoice, user, XTR currency, exact Stars amount and charge ID, then records VIP membership once. The Telebot Creator handler must also validate pre_checkout_query and answer it within Telegram's required time. The exact TPY HTTP-call syntax still needs to be matched to the current payment handler in your Telebot Creator project; do not paste guessed Python syntax into TPY.

The bot must be an administrator in @NairaHackerAI_Official for reliable channel-membership verification.

## Approved values
- Daily bonus: 3 KNV
- Verified channel join: 10 KNV
- Monetag valued rewarded ad: 5 KNV
- Display conversion: 1 KNV = $0.01; display estimate only, not a guaranteed cash redemption value.
- Silver: 100 Telegram Stars / 30 days
- Gold: 250 Telegram Stars / 30 days
- Diamond: 500 Telegram Stars / 30 days
- Withdrawal UI remains WITHDRAWAL LOCKED and does not accept requests while locked.
- Referral link uses @KencoinOfficialBot; no referral reward amount has been approved, so it does not credit referral coins yet.

## Final deployment gate
Do not merge to main or deploy until Netlify environment variables are set, Monetag postback is configured, the Telebot Creator successful_payment handler calls /payment-confirm, and all flows are tested inside Telegram.
