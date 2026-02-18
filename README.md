# Telegram Exbo announcer bot

A Node.js Telegram bot that polls the Exbo forum API at a configurable interval and posts new comments to configured Telegram channels.

## What you need

- **Node.js 18+**
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather): create a bot with `/newbot`, copy the token.
- **Channel IDs** (or chat IDs) where the bot should post. Add the bot to the channel as an admin with permission to post messages.

## Setup

1. **Create a Telegram bot**

   - Open [@BotFather](https://t.me/BotFather) in Telegram.
   - Send `/newbot`, follow the prompts, and copy the **token** (this is `TELEGRAM_BOT_TOKEN`).

2. **Add the bot to your channel and get the channel ID**

   - Add the bot to your channel as an **administrator** with permission to **post messages**.
   - Channel IDs are usually negative numbers (e.g. `-1001234567890`). To get the ID: send `/chatid` to the bot from that chat (or forward a message from the channel to [@userinfobot](https://t.me/userinfobot)).

3. **Configure the project**

   ```bash
   npm install
   cp .env.example .env
   ```

   Edit `.env`:

   - `TELEGRAM_BOT_TOKEN` – your Telegram bot token (required).
   - `TELEGRAM_CHANNEL_IDS` – comma-separated chat/channel IDs, e.g. `-1001234567890,-1009876543210` (required).
   - `POLL_INTERVAL_MS` – optional; milliseconds between polls (default: 300000 = 5 minutes).
   - Authors to poll can be managed via bot commands (see below) or loaded from the state file.

   **Optional env vars:**

   - `AUTHOR_REQUEST_DELAY_MS` – delay between Exbo API requests per author (default: 1000).
   - `TELEGRAM_SEND_DELAY_MS` – delay between sending messages to channels (default: 500).
   - `LAST_SEEN_STATE_FILE` – path to JSON state file (default: `last-seen-posts.json`).
   - `POSTS_PER_AUTHOR` – max number of post IDs to keep per author (default: 5).
   - `MAX_SNIPPET_LEN` – max length of post snippet in characters (default: 1000).
   - `LOG_LEVEL` – `info`, `warn`, or `error`; reduces log noise when set to `warn` or `error` (default: `info`).
   - `SKIP_SEND_POST_OLDER_THAN_MS` – if set > 0, posts older than this many ms are not sent to Telegram on first run or restart; they are only saved in state. Default: 3600000 (1 hour). Set 0 to disable.
   - `ADMIN_USER_IDS` – comma-separated Telegram user IDs allowed to use `/addauthor`, `/removeauthor`, `/listauthors`, `/chatid`. If empty, anyone can use them.

4. **Build and run**

   ```bash
   npm run build
   npm start
   ```

   Or in development:

   ```bash
   npm run dev
   ```

## How it works

- On startup, the bot loads state from `LAST_SEEN_STATE_FILE` (if present), then starts long polling for Telegram updates and runs the first Exbo forum poll immediately.
- Every `POLL_INTERVAL_MS` milliseconds it fetches the Exbo posts API for each tracked author, parses new posts (skipping ones already seen), and sends formatted messages (HTML) to each chat in `TELEGRAM_CHANNEL_IDS`.
- The bot listens for **commands**: `/chatid` (get current chat ID), `/listauthors`, `/addauthor <username>`, `/removeauthor <username>`. Use these to manage the list of Exbo authors and to discover channel IDs.

## Scripts

- `npm run build` – compile TypeScript to `dist/`
- `npm start` – run the compiled bot
- `npm run dev` – run with ts-node (no build step)

## Free hosting (Render, Fly.io, Railway)

- Set **environment variables** in the host’s dashboard (no `.env` on the server): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_IDS`, and any optional vars above.
- **Build**: `npm install && npm run build`. **Start**: `node dist/index.js` (or `npm start`).
- If the host sets `PORT` (e.g. Render), the bot starts a small **health-check HTTP server** on that port (GET `/` returns 200). Use an uptime monitor (e.g. UptimeRobot) to hit that URL so the service stays awake on Render’s free tier.
- **State file**: On **ephemeral** disks (e.g. Render free tier), `last-seen-posts.json` is lost on restart; the bot will resend the last few posts after deploy. For **persistent state**, use **Fly.io** with a [volume](https://fly.io/docs/volumes/) and set `LAST_SEEN_STATE_FILE` to a path on the volume (e.g. `/data/last-seen-posts.json`), or use an external store (e.g. Redis) and adapt the code to read/write state there.
