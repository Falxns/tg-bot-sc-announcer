# tg-bot-sc-announcer

Telegram bot that polls the [Exbo forum](https://forum.exbo.ru) API for new comments by configured authors and posts them to one or more Telegram channels or groups.

## What it does

- Polls Exbo forum comments for a list of usernames at a configurable interval
- Sends new comments to Telegram as formatted messages (author, date, snippet, link)
- Persists “last seen” post IDs so only new comments are announced
- Supports admin-only Telegram commands to list/add/remove tracked authors
- Optional HTTP health-check server (e.g. for PaaS readiness probes)

## Stack

- **Runtime:** Node.js 18+
- **Language:** TypeScript
- **Telegram:** [Telegraf](https://telegraf.js.org/)
- **Config:** `dotenv` + environment variables

## Prerequisites

- Node.js 18 or higher
- A [Telegram Bot](https://t.me/BotFather) token
- One or more Telegram channel/group IDs where the bot can post (and is added as admin)

## Setup

```bash
# Clone and install
git clone https://github.com/Falxns/tg-bot-sc-announcer.git
cd tg-bot-sc-announcer
npm install

# Copy env example and fill in your values
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHANNEL_IDS` | Yes | Comma-separated chat IDs (e.g. `-1001234567890`) |
| `POLL_INTERVAL_MS` | No | Poll interval in ms (default: 300000 = 5 min), clamped 1 min–24 h |
| `AUTHOR_REQUEST_DELAY_MS` | No | Delay between Exbo API requests per author (default: 1000) |
| `LAST_SEEN_STATE_FILE` | No | Path to JSON state file (default: `last-seen-posts.json`) |
| `ADMIN_USER_IDS` | No | Comma-separated Telegram user IDs; if empty, all users can use admin commands |
| `PORT` | No | If set, starts an HTTP server on this port that responds `ok` (for health checks) |
| `LOG_LEVEL` | No | `info` (default), `debug`, or `warn` |

See `.env.example` for more optional variables.

## Run

```bash
# Build and run
npm run build
npm start
```

Development (run without building):

```bash
npm run dev
```

## Telegram commands (admin)

- `/chatid` — Reply with the current chat ID (useful to get channel/group IDs for `TELEGRAM_CHANNEL_IDS`)
- `/listauthors` — List tracked Exbo usernames
- `/addauthor <username>` — Start tracking an Exbo user
- `/removeauthor <username>` — Stop tracking an Exbo user

Author list and “last seen” state are saved to the state file and restored on restart.

## License

MIT
