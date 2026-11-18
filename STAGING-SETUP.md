# Kencoin staging configuration and release gate

## Netlify environment variables
Set these in the Kencoin Netlify site before production:
- `BOT_TOKEN`: token for `@KencoinOfficialBot`. Keep private; never place it in browser code.
- `POSTBACK_SECRET`: long random secret shared only with the Monetag postback configuration.
- `PAYMENT_CONFIRM_SECRET`: a different long random secret shared only with the Telebot Creator payment handler.

The ledger stores each reward as a separate, immutable event key and calculates the visible balance from those entries. It does not update one shared balance counter. Netlify Blobs is a key/value event store, not a full transactional financial database; do not enable cash withdrawals or treat displayed USD equivalents as guaranteed redeemable funds until a transactional payout ledger and funding controls are in place.

## Monetag
The Mini App loads the supplied zone SDK:
`https://libtl.com/sdk.js` with zone `12287936` and global `show_12287936`.

Configure this GET postback URL in Monetag, replacing the site domain and secret:
`https://YOUR-NETLIFY-SITE.netlify.app/monetag-postback?secret=YOUR_POSTBACK_SECRET&ymid={ymid}&zone_id={zone_id}&event_type={event_type}&reward_event_type={reward_event_type}&telegram_id={telegram_id}&estimated_price={estimated_price}`

Only a server-received `event_type=impression` and `reward_event_type=valued` can create the 5 KNV ledger event. Each `ymid` is credited once. The browser SDK callback is not treated as proof of payment. Check the Monetag dashboard's macro syntax and test an actual valued impression before launch.

## Telegram Stars and Telebot Creator
The Mini App creates XTR invoice links for Silver 100 Stars, Gold 250 Stars and Diamond 500 Stars, each for 30 days. It opens invoices using Telegram WebApp `openInvoice`.

After Telebot Creator receives `successful_payment`, its server-side handler must POST to:
`https://YOUR-NETLIFY-SITE.netlify.app/payment-confirm`

Headers:
- `Content-Type: application/json`
- `X-Kencoin-Payment-Secret: YOUR_PAYMENT_CONFIRM_SECRET`

JSON fields:
- `payload`: `successful_payment.invoice_payload`
- `user_id`: `message.from.id`
- `currency`: `successful_payment.currency`
- `total_amount`: `successful_payment.total_amount`
- `telegram_charge_id`: `successful_payment.telegram_payment_charge_id`

The endpoint checks the pending invoice, Telegram user, XTR currency, exact amount and unique Telegram charge. It uses conditional writes to stop two confirmations from activating the same invoice. The Telebot Creator handler must also validate `pre_checkout_query` and answer it within Telegram's 10-second limit. Do not replace the bot's existing Telebot Creator webhook with the Netlify webhook; Telegram allows one active webhook URL per bot.

## Telegram identity and channel task
- The API validates Telegram Mini App `initData` using the bot token.
- The bot must be an administrator in `@NairaHackerAI_Official` to verify channel membership.
- The official channel join task awards 10 KNV once per Telegram account.

## Referrals
The Mini App can record a referral attribution when Telegram supplies the referring ID as the Mini App `start_param`. A plain bot deep link `https://t.me/KencoinOfficialBot?start=ID` first reaches the bot's `/start` handler; that handler must carry the ID into the Mini App launch parameter for attribution to register. The app currently tracks referral counts only. No referral KNV reward is issued because no referral reward amount has been approved.

## Approved values and UI rules
- Daily bonus: 3 KNV, once per Lagos calendar day.
- Monetag valued rewarded ad: 5 KNV.
- Display conversion: 1 KNV = $0.01, an estimate only and not a promise of cash redemption.
- Withdrawals remain visibly `WITHDRAWAL LOCKED` with `Open on the day. Keep accumulating KNV.`; no request is accepted while locked.
- When withdrawals are enabled in the future, payout networks are USDT TRC20 and BEP20. Show the ₦2,000 service fee and actual network gas fee separately. Minimum amount, treasury funding and approval controls must be configured first.

## Final deployment gate
Do not merge this branch into `main` or deploy yet. First:
1. Set the three Netlify environment variables.
2. Configure the Monetag postback URL and test one valued and one non-valued ad.
3. Add the `successful_payment` forwarding call and pre-checkout validation in Telebot Creator.
4. Ensure the bot is admin in the official channel.
5. Test authenticated profile, daily bonus duplicate protection, channel task, ad reward deduplication, Stars invoice/payment activation and withdrawal lock inside Telegram.
6. Review the balance/reward economics: 5 KNV is $0.05 at the display rate, and actual Monetag proceeds can be lower.

GitHub Actions runs JavaScript syntax checks on staging. A passing syntax check is not a live integration test.
