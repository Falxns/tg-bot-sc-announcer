# tg-bot-sc-announcer

Telegram + Discord bot service that polls the [Exbo forum](https://forum.exbo.ru) API for new comments by configured authors and posts them to Telegram channels while also running Discord moderation/role tooling in the same process.

## What it does

- Polls Exbo forum comments for a list of usernames at a configurable interval
- Sends new comments as Telegram HTML: one opening line `🔔 Новый комментарий от` with a **bold** linked forum author; if the discussion title is resolved (from the API `included` data or `GET /api/discussions/:id`), the **same line** adds `в теме:` plus a **bold** title (plain prefix, bold title only). Then a blank line and the body—stacked `{name} написал:` headers each followed by an **expandable** blockquote for quoted content (nested forum `<blockquote>` pairs are kept inside one quote). Then `{author} написал:` or `{author} ответил:` with an expandable blockquote for the new text (`/u/…` → `@Display` profile links, `/d/…` kept as links). Inline forum images become numbered links `Изображение 1`, `Изображение 2`, … in order; after the text message the bot sends those images as Telegram **photos** (albums of up to 10 per `sendMediaGroup`, single image via `sendPhoto`). Footer: author hashtag and `🔗 Ссылка на сообщение` when the post URL exists. Snippet budget subtracts the discussion line’s visible length. No italic markup; optional logging and mention/title fetch limits—see `.env.example`.
- Persists “last seen” post IDs so only new comments are announced
- Supports admin-only Telegram commands to list/add/remove tracked authors
- Runs a Discord bot in the same process with:
  - admin slash command `/post` (post as bot to a target channel)
  - role assignment message buttons via `/rolepanel`
  - channel-aware moderation rules (invite filtering, attachment/text restrictions, blocked keywords, warning + timeout escalation)
- Optional HTTP health-check server (e.g. for PaaS readiness probes)

## Stack

- **Runtime:** Node.js 18+
- **Language:** TypeScript
- **Telegram:** [Telegraf](https://telegraf.js.org/)
- **Discord:** [discord.js](https://discord.js.org/)
- **Config:** `dotenv` + environment variables

## Prerequisites

- Node.js 18 or higher
- A [Telegram Bot](https://t.me/BotFather) token
- One or more Telegram channel/group IDs where the bot can post (and is added as admin)
- A Discord bot token, target guild ID, and bot permissions for message management, role management, timeout moderation, and **Attach Files** (for `/post` images)

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
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token from the Discord Developer Portal |
| `DISCORD_GUILD_ID` | Yes | Discord guild/server ID where slash commands are registered |
| `POLL_INTERVAL_MS` | No | Poll interval in ms (default: 300000 = 5 min), clamped 1 min–24 h |
| `AUTHOR_REQUEST_DELAY_MS` | No | Delay between Exbo API requests per author (default: 1000) |
| `STATE_BACKEND` | No | State storage backend: `file` (default) or `upstash` |
| `LAST_SEEN_STATE_FILE` | No | Path to JSON state file when `STATE_BACKEND=file` (default: `last-seen-posts.json`) |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL (required when `STATE_BACKEND=upstash`) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST token (required when `STATE_BACKEND=upstash`) |
| `UPSTASH_STATE_KEY` | No | Redis key for serialized state JSON (default: `tg-bot-sc-announcer:state`) |
| `ADMIN_USER_IDS` | No | Comma-separated Telegram user IDs; if empty, all users can use admin commands |
| `DISCORD_ADMIN_ROLE_IDS` | No | Comma-separated Discord role IDs allowed to run `/post`, `/rolepanel`, and `/linkpanel` (when empty, any member who passes Discord’s command permissions may use them) |
| `DISCORD_ROLE_PANEL_CHANNEL_ID` | No | Restrict `/rolepanel` usage to one channel |
| `DISCORD_BLOCK_INVITE_LINKS_GLOBAL` | No | `1`/`0` toggle for global Discord invite-link filtering |
| `DISCORD_INVITE_ALLOWED_ROLE_IDS` | No | Roles allowed to bypass invite-link filter |
| `DISCORD_WARNINGS_BEFORE_TIMEOUT` | No | Violations before automatic timeout (default: 3) |
| `DISCORD_TIMEOUT_MS` | No | Timeout duration in ms after threshold (default: 600000) |
| `DISCORD_WARNING_MESSAGE_TTL_MS` | No | Auto-delete delay for warning notices (default: 12000) |
| `DISCORD_CHANNEL_POLICIES_JSON` | No | Channel policy map for video/image/text/keyword moderation rules |
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

## Discord commands (admin/mod roles)

- `/post channel:<channel> [image] [embed_*]` — optional **`embed_title`**, **`embed_description`**, **`embed_url`**, **`embed_color`** (`#RRGGBB` or decimal); optionally attach **one** file on the command, then a **modal** for optional body text (can be empty if you only send an attachment/embed); embed and file attach to the **first** posted message
- `/rolepanel channel:<channel> role1:<role> [label1…label6] [role2…role6] [single_role] [embed_*]` — required **`channel`** + **`role1`** first (Discord rule); optional `single_role:true` makes panel roles mutually exclusive (user keeps only one role from that panel); also supports same **`embed_*`** as `/post`; command opens a modal for optional multiline message text
- `/linkpanel channel:<channel> url1:<https://...> [label1…label5] [url2…url5] [embed_*]` — creates message buttons that open URLs (no role toggle), then opens a modal for optional multiline message text

Role-panel definitions and moderation warning counters are saved in shared bot state (`file` or Upstash, depending on `STATE_BACKEND`) and restored on restart.

## License

MIT
