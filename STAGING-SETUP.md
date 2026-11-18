# Kencoin staging setup and release gate

Do not merge this branch into main or deploy until the external services below are configured and every live test passes.

## Included in staging

- Telegram Mini App authentication using Telegram-signed initData.
- Supabase Postgres transactional wallet ledger.
- Daily bonus: 3 KNV once per Lagos calendar day.
- Verified official-channel join: 10 KNV once.
- Monetag zone 12287936: 2 KNV only after a server-side valued impression; duplicate postbacks do not pay twice.
- Telegram Stars: Silver 100, Gold 250, Diamond 500 Stars, each for 30 days. Invoice checkout opens inside the Mini App.
- Referral attribution is recorded once; no referral reward is issued because no reward amount has been approved.
- USDT TRC20/BEP20 withdrawal requests, balance reservation, admin review and transaction-reference tracking. Withdrawals remain locked until 1 March 2027 at 00:00 Africa/Lagos time. The locked UI displays a live countdown to that date.
- Private admin review page at /admin.html.

## 1. Supabase database

Create a free Supabase project at https://supabase.com/dashboard. The current Free plan includes 500 MB Postgres storage, but projects can pause after one week of inactivity. See https://supabase.com/pricing.

For a brand-new Supabase project, run the full file database/supabase-schema.sql once. If this database already exists from an earlier Kencoin setup, do not rerun the whole schema blindly; apply database/migrations/20261119_withdrawal_unlock_march_2027.sql in the SQL Editor to update the withdrawal date safely.

From Project Settings → API Keys (or the Connect dialog), copy the Project URL and the server-side Secret API key. Set them in Netlify as SUPABASE_URL and SUPABASE_SECRET_KEY. Never put the secret key in frontend JavaScript. Do not use a publishable key in the Netlify functions.

## 2. Netlify environment variables

Set these in the Kencoin Netlify site's environment settings:

| Variable | Purpose |
|---|---|
| BOT_TOKEN | Token for @KencoinOfficialBot |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_SECRET_KEY | Supabase server-side secret API key |
| POSTBACK_SECRET | Random secret shared with Monetag |
| PAYMENT_CONFIRM_SECRET | Random secret shared with Telebot Creator payment commands |
| BOT_WEBHOOK_SECRET | Different random secret shared with the Telebot Creator referral command |
| ADMIN_SECRET | Random secret for /admin.html |

Use long, different random values for all four secrets. Do not commit real values. A blank template is in .env.example.

## 3. Telebot Creator payment integration

Do not replace the existing Telebot Creator webhook. Keep the existing Mini App launch/menu button. Add these variables to the bot's private .env settings:

- KENCOIN_SITE_URL = your Netlify URL, without a trailing slash
- PAYMENT_CONFIRM_SECRET = same value as Netlify
- BOT_WEBHOOK_SECRET = same value as Netlify

### Add command /handler_pre_checkout_query

    payload = str(message.invoice_payload)
    user_id = str(message.from_user.id)
    valid_prefix = payload.startswith("kc_silver_") or payload.startswith("kc_gold_") or payload.startswith("kc_diamond_")

    if message.currency != "XTR" or not valid_prefix:
        bot.answerPreCheckoutQuery(message.id, False, error_message="Invalid Kencoin invoice.")
    else:
        try:
            response = HTTP.post(
                KENCOIN_SITE_URL + "/api/payment/precheckout",
                json={
                    "payload": payload,
                    "user_id": user_id,
                    "currency": message.currency,
                    "total_amount": message.total_amount
                },
                headers={"x-kencoin-payment-secret": PAYMENT_CONFIRM_SECRET},
                timeout=8
            )
            result = response.json()
            if response.status_code == 200 and result.get("ok"):
                bot.answerPreCheckoutQuery(message.id, True)
            else:
                bot.answerPreCheckoutQuery(message.id, False, error_message="This Kencoin invoice is invalid or expired. Please create a new invoice.")
        except Exception:
            bot.answerPreCheckoutQuery(message.id, False, error_message="Kencoin could not verify this invoice. Please try again.")

Telegram requires the pre-checkout answer within 10 seconds. The API verifies the pending invoice, owner, XTR currency and exact Stars amount.

### Add this at the TOP of the existing wildcard command *

Do not delete any other existing wildcard-handler logic.

    pay = message.get("successful_payment")
    if pay:
        payment_data = {
            "payload": pay.invoice_payload,
            "user_id": str(message.from_user.id),
            "currency": pay.currency,
            "total_amount": pay.total_amount,
            "telegram_charge_id": pay.telegram_payment_charge_id
        }
        confirmed = False
        for attempt in range(3):
            try:
                response = HTTP.post(
                    KENCOIN_SITE_URL + "/payment-confirm",
                    json=payment_data,
                    headers={"x-kencoin-payment-secret": PAYMENT_CONFIRM_SECRET},
                    timeout=20
                )
                result = response.json()
                if response.status_code == 200 and result.get("ok"):
                    confirmed = True
                    break
            except Exception:
                pass
        if confirmed:
            bot.sendMessage("Payment verified. Your Kencoin membership is active.")
        else:
            bot.sendMessage("Telegram received your payment, but Kencoin activation is still being verified. Please contact support and include this charge ID: " + str(pay.telegram_payment_charge_id))

The database confirms each Telegram charge idempotently. Do not activate VIP locally before the server confirms the successful_payment update.

## 4. Telebot Creator referral integration

Add this near the top of the existing /start command, before its welcome response. Keep the existing Mini App launch button/menu behaviour.

    parts = str(message.text or "").split(maxsplit=1)
    if len(parts) == 2:
        referrer_id = parts[1].strip()
        invitee_id = str(message.from_user.id)
        if referrer_id.isdigit() and referrer_id != invitee_id:
            try:
                HTTP.post(
                    KENCOIN_SITE_URL + "/api/referral/register-bot",
                    json={
                        "referrer_id": referrer_id,
                        "invitee_id": invitee_id,
                        "first_name": message.from_user.first_name,
                        "username": message.from_user.username
                    },
                    headers={"x-kencoin-bot-secret": BOT_WEBHOOK_SECRET},
                    timeout=8
                )
            except Exception:
                pass

Referral links use https://t.me/KencoinOfficialBot?start=TELEGRAM_USER_ID. No referral KNV is issued.

## 5. Monetag

The Mini App creates a unique server-side ad session before showing an ad. Configure this postback URL in Monetag, replacing the domain and secret:

    https://charming-peony-faa6f9.netlify.app/monetag-postback?secret=YOUR_POSTBACK_SECRET&ymid={ymid}&zone_id={zone_id}&sub_zone_id={sub_zone_id}&event_type={event_type}&reward_event_type={reward_event_type}&request_var={request_var}&telegram_id={telegram_id}&estimated_price={estimated_price}

Use Monetag's exact macro placeholders shown above when saving the postback for the main SDK zone. The endpoint validates the main zone, event type, user/session match and 48-hour session window; sub-zone and placement values are included for reporting. The endpoint accepts Monetag impression or click events for zone 12287936. Only reward_event_type=valued earns 2 KNV, once per ymid; non_valued earns nothing. Monetag can send both impression and click for one ad show, so the same ymid is deduplicated. Test one valued and one non-valued event before launch.

## 6. Withdrawals

While locked, the Mini App shows WITHDRAWAL LOCKED, the message “Open on the day. Keep accumulating KNV.” and a live days/hours/minutes/seconds countdown. The backend rejects withdrawal requests before 1 March 2027, 00:00 Africa/Lagos time. After unlock, the Mini App supports USDT TRC20 and BEP20 request submission, wallet address validation, balance reservation and request history. Admins review requests at /admin.html, approve or reject them, and record a transaction reference when paid.

The minimum withdrawal amount has not been approved. It is intentionally blank in kencoin_settings, so withdrawal requests remain disabled until the owner chooses a minimum. After that decision, run this in Supabase SQL Editor:

    update public.kencoin_settings
    set setting_value = 'YOUR_APPROVED_MINIMUM_KNV'
    where setting_key = 'minimum_withdrawal_knv';

There is no ₦2,000 service fee. If a network fee is incurred, show the actual USDT network gas fee separately and transparently; never add a fixed Kencoin service fee. The current workflow records and administers requests; it does not automatically send USDT. Admin must pay from a funded treasury wallet and record the transaction reference before marking a request paid.

## 7. Channel permissions

Make @KencoinOfficialBot an administrator of @NairaHackerAI_Official so getChatMember can reliably verify channel membership.

## 8. Live tests required before deployment

- Apply the Supabase schema and set all seven Netlify environment variables.
- Confirm /api/me returns the authenticated Telegram user's profile.
- Claim daily bonus twice: only one 3 KNV credit.
- Verify channel join twice: only one 10 KNV credit.
- Send one Monetag valued postback twice: only one 2 KNV credit.
- Send a non-valued postback: zero KNV.
- Create Silver, Gold and Diamond invoices and verify 100 / 250 / 500 XTR.
- Test pre-checkout rejection for wrong user, amount, currency and expired invoice.
- Complete a real Stars payment and confirm activation only after successful_payment reaches /payment-confirm.
- Test referral attribution and duplicate referrals.
- Confirm withdrawals are rejected while locked. After unlock, test address validation, configured minimum, insufficient balance, admin approval, rejection and paid transaction reference.
- Check browser console and Netlify function logs.

Syntax checks do not replace live integration tests. Do not deploy or merge until every required test passes.
