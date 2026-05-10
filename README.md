# tg-bot-sc-announcer

Telegram + Discord bot service that polls the [Exbo forum](https://forum.exbo.ru) API for new comments by configured authors and posts them to Telegram channels while also running Discord moderation/role tooling in the same process.

## What it does

- Polls Exbo forum comments for a list of usernames at a configurable interval
- Sends new comments as Telegram HTML: one opening line `🔔 Новый комментарий от` with a **bold** linked forum author; if the discussion title is resolved (from the API `included` data or `GET /api/discussions/:id`), the **same line** adds `в теме:` plus a **bold** title (plain prefix, bold title only). Then a blank line and the body—stacked `{name} написал:` headers each followed by an **expandable** blockquote for quoted content (nested forum `<blockquote>` pairs are kept inside one quote). Then `{author} написал:` or `{author} ответил:` with an expandable blockquote for the new text (`/u/…` → `@Display` profile links, `/d/…` kept as links). Inline forum images become numbered links `Изображение 1`, `Изображение 2`, … in order; after the text message the bot sends those images as Telegram **photos** (albums of up to 10 per `sendMediaGroup`, single image via `sendPhoto`). Footer: author hashtag and `🔗 Ссылка на сообщение` when the post URL exists. Snippet budget subtracts the discussion line’s visible length. No italic markup; optional logging and mention/title fetch limits—see `.env.example`.
- Persists “last seen” post IDs so only new comments are announced
- Supports admin-only Telegram commands to list/add/remove tracked authors
- Runs a Discord bot in the same process with:
  - admin slash commands `/post` and `/edit` (post or edit bot messages in a target channel)
  - role assignment message buttons via `/rolepanel`
  - channel-aware moderation (minor/major severity, per-channel warnings, guild mute ladders, 3-day decay, DM + channel fallback, optional log channel, staff `/mute` `/unmute` `/warn` `/unwarn` `/modstatus`, optional external-link domain blacklist)
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
- A Discord bot token, target guild ID, and bot permissions for message management, role management, timeout moderation, and **Attach Files** (for `/post` / `/edit` images and files attached to moderation log posts)

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
| `DISCORD_ADMIN_ROLE_IDS` | No | Comma-separated Discord role IDs allowed to run `/post`, `/edit`, `/rolepanel`, `/linkpanel`, `/mute`, `/unmute`, `/warn`, `/unwarn`, `/modstatus` (when empty, any member who passes Discord’s command permissions may use them) |
| `DISCORD_ROLE_PANEL_CHANNEL_ID` | No | Restrict `/rolepanel` usage to one channel |
| `DISCORD_BLOCK_INVITE_LINKS_GLOBAL` | No | `1`/`0` toggle for global Discord invite-link filtering |
| `DISCORD_INVITE_ALLOWED_ROLE_IDS` | No | Roles allowed to bypass invite-link filter |
| `DISCORD_MINOR_TIMEOUT_LADDER_MS` | No | Comma-separated minor mute durations (ms); default `3600000,21600000,43200000,86400000` (1h, 6h, 12h, 1d) |
| `DISCORD_WARNINGS_BEFORE_TIMEOUT` | No | Minor warnings per channel before the minor-timeout ladder applies; also the denominator in mod-log `n/threshold` (default: **3**) |
| `DISCORD_MAJOR_TIMEOUT_LADDER_MS` | No | Comma-separated major mute durations (ms); default `86400000,259200000,604800000` (1d, 3d, 7d) |
| `DISCORD_MODERATION_DECAY_MS` | No | No violations for this long resets minor warnings + tiers (default: 259200000 = 3 days) |
| `DISCORD_MODERATION_LOG_CHANNEL_ID` | No | Text channel ID for moderation audit embeds |
| `DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST` | No | Comma-separated or JSON array of hosts; non-invite `http(s)` URLs matching these trigger a **major** hit (empty = disabled) |
| `DISCORD_SPAM_FILTER_CHANNEL_IDS` | No | Comma-separated channel/thread IDs where **consecutive near-duplicate text** from the **same user** (vs previous message in channel via API) counts as **minor** spam: strict normalized equality, or same **letter/digit skeleton** with similar length, or (for long text only) high **Levenshtein similarity**; empty disables. Bot needs **Read Message History** there. |
| `DISCORD_WARNING_MESSAGE_TTL_MS` | No | Auto-delete delay for ephemeral-style channel notices (default: 12000) |
| `DISCORD_CHANNEL_POLICIES_JSON` | No | Per-channel policies: `blockInviteLinks`, `allowDiscordInvites`, `inviteViolationSeverity`, `blockVideos` / `blockImages` / `blockText`, `mediaViolationSeverity`, `blockedKeywords`, `keywordViolationSeverity`, `allowInviteRoleIds` |
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
- `/edit channel:<channel> message_id:<snowflake> [image] [embed_*]` — edit **one** existing message **sent by this bot** in that channel (copy message ID with Developer Mode → right‑click → Copy ID); same embed/file options as `/post`; modal sets new body text up to **2000** characters (single Discord message); optional **`image`** replaces attachments when provided
- `/rolepanel channel:<channel> role1:<role> [label1…label6] [role2…role6] [single_role] [embed_*]` — required **`channel`** + **`role1`** first (Discord rule); optional `single_role:true` makes panel roles mutually exclusive (user keeps only one role from that panel); also supports same **`embed_*`** as `/post`; command opens a modal for optional multiline message text
- `/linkpanel channel:<channel> url1:<https://...> [label1…label5] [url2…url5] [embed_*]` — creates message buttons that open URLs (no role toggle), then opens a modal for optional multiline message text
- `/mute user:<user> duration:<choice> [reason] [screenshot] [message_id]` — manual timeout (does **not** advance auto minor/major ladder tiers); **`duration`** is one of: 1 hour, 6 hours, 12 hours, 1 day, 3 days, 7 days, 14 days, 28 days; optional **`screenshot`** attaches to the moderation log message when **`DISCORD_MODERATION_LOG_CHANNEL_ID`** is set; optional **`message_id`** copies that message’s text/attachment URLs into the mod log **when it belongs to the muted user** — fetch happens in the **channel or thread where you run the command**
- `/unmute user:<user>` — clears Discord timeout
- `/warn user:<user> [channel] [amount] [reason] [screenshot] [message_id]` — increments per-channel minor warning counter; optional **`screenshot`** and **`message_id`** behave like **`/mute`** (resolve **`message_id`** in the channel/thread where the command is run); whenever the count after the command is **≥ `DISCORD_WARNINGS_BEFORE_TIMEOUT`** (default **3**), applies **one** timeout using **`DISCORD_MINOR_TIMEOUT_LADDER_MS`** and advances the guild minor tier (**same rule as automod** — still applies at 4/3, 5/3, …)
- `/unwarn user:<user> [channel] [amount] [clear]` — decrements or clears per-channel minor warnings
- `/modstatus user:<user>` — read-only: per-channel **minor** warning rows stored in bot state, **next** minor/major ladder step and duration (same logic as automod and threshold `/warn`), and last-violation / **decay** hint for `DISCORD_MODERATION_DECAY_MS` (no state is changed)

Role-panel definitions and moderation state (per-channel minor warnings, guild minor/major mute tiers, last-violation timestamps) are saved in shared bot state (`file` or Upstash, depending on `STATE_BACKEND`) and restored on restart. Legacy `discordModerationWarnings` (`guildId:userId`) in old JSON files is migrated into a `legacy` scope bucket and merged on first per-channel write.

### Discord AutoMod (recommended)

Semantic rules (slurs, cheats, 18+, marketplace phrases) are best handled with **Discord Server Settings → AutoMod** (keyword lists, block/alert, log to a channel). This bot complements AutoMod with mechanical checks (invites, attachments, keyword lists you map in `DISCORD_CHANNEL_POLICIES_JSON`, optional domain blacklist) and staff slash commands.

## License

MIT
