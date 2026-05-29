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
  - channel-aware moderation (light/major severity, **server-wide strikes**, unified timeout ladder, decay, DM + channel fallback, optional log + staff-summary channels, staff `/mute` `/unmute` `/strike` `/unstrike` `/ban` `/unban` `/modstatus`, optional external-link domain blacklist)
  - optional **clan role automation**: plain-text commands in the rules thread (`+клан` / `-клан` / `!создать`), leader-approved grants, mod review for new clans (`/clanpanel`, `/clanslist`)
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
- A Discord bot token, target guild ID, and bot permissions for message management, role management, timeout moderation, bans, and **Attach Files** (for `/post` / `/edit` images and files attached to moderation log posts)

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
| `DISCORD_ADMIN_ROLE_IDS` | No | Comma-separated Discord role IDs for `/post`, `/edit`, `/rolepanel`, `/editrolepanel`, `/linkpanel`, `/editlinkpanel` (when empty, any member may use those commands). Also allowed to run moderation slash; bypasses **`DISCORD_MODERATION_DAILY_QUOTA`**. |
| `DISCORD_MODERATOR_ROLE_IDS` | No | Comma-separated Discord role IDs for moderation slash (`/mute`, `/strike`, `/ban`, …). Members with these roles should **not** have Discord **Moderate Members** / **Ban Members** (bot applies timeouts/bans). When both this and **`DISCORD_ADMIN_ROLE_IDS`** are empty, moderation slash is denied unless **`DISCORD_DEV_MODE=1`**. |
| `DISCORD_ROLE_PANEL_CHANNEL_ID` | No | Restrict `/rolepanel` and `/editrolepanel` usage to one channel |
| `DISCORD_BLOCK_INVITE_LINKS_GLOBAL` | No | `1`/`0` toggle for global Discord invite-link filtering |
| `DISCORD_INVITE_ALLOWED_ROLE_IDS` | No | Roles allowed to bypass invite-link filter |
| `DISCORD_TIMEOUT_LADDER_MS` | No | Unified automod/staff timeout ladder (ms); default `3600000,21600000,43200000,86400000,259200000,604800000` (1h, 6h, 12h, 1d, 3d, 7d). Manual `/mute` may also use 14d/28d (not on this ladder). |
| `DISCORD_WARNINGS_BEFORE_TIMEOUT` | No | Server-wide strikes before ladder timeouts apply; mod-log shows `n/threshold` (default: **3**) |
| `DISCORD_MAJOR_MIN_LADDER_STEP` | No | Ladder index for first major automod hit (default **3** = 1 day) |
| `DISCORD_MODERATION_DECAY_MS` | No | No violations for this long resets global warns + ladder tier (default: 259200000 = 3 days) |
| `DISCORD_MODERATION_DAILY_QUOTA` | No | Per-moderator daily cap on **`/mute`**, **`/strike`**, **`/ban`** combined (UTC day; default **30**; **`0`** = off). Bypass: **`DISCORD_ADMIN_ROLE_IDS`** |
| `DISCORD_MODERATION_LOG_CHANNEL_ID` | No | Text channel ID for **full** moderation audit embeds (**automod** + **manual** `/mute` `/unmute` `/strike` `/unstrike` `/ban` `/unban`) |
| `DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID` | No | Optional **one-line** staff digest channel: manual mod commands (link to **`DISCORD_MODERATION_LOG_CHANNEL_ID`**), role creates, creator posts |
| `DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS` | No | Comma-separated staff role IDs; digest when holder **creates** a guild role or **assigns/removes** a role on a member via audit log (needs **View Audit Log**; excludes bot role-panel toggles) |
| `DISCORD_STAFF_SUMMARY_ROLE_AUDIT_DELAY_MS` | No | Wait before reading audit log for role events (default **1000** ms; alias: `DISCORD_STAFF_SUMMARY_ROLE_CREATE_AUDIT_DELAY_MS`) |
| `DISCORD_STAFF_SUMMARY_CREATOR_CHANNEL_IDS` | No | Comma-separated channel IDs; digest when a member with creator roles posts a **top-level** message (not threads) |
| `DISCORD_STAFF_SUMMARY_CREATOR_ROLE_IDS` | No | Comma-separated role IDs treated as “creator” for the above |
| `DISCORD_STAFF_SUMMARY_CREATOR_COOLDOWN_MS` | No | Min gap between creator digests per author+channel (default **1800000** = 30 min) |
| `DISCORD_MESSAGE_REVIEW_CHANNEL_ID` | No | When set with **`DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_IDS`**: cache media/URL messages in RAM; post copy to this channel **only** when the author **self-deletes** (not persisted across deploy) |
| `DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_IDS` | No | Comma-separated channel IDs to watch |
| `DISCORD_MESSAGE_REVIEW_CACHE_TTL_MS` | No | In-memory cache TTL (default **3600000** = 1 h) |
| `DISCORD_MESSAGE_REVIEW_MAX_CACHE_ENTRIES` | No | Max cached messages (default **5000**) |
| `DISCORD_MESSAGE_REVIEW_BYPASS_ROLE_IDS` | No | Skip caching for these roles |
| `DISCORD_MESSAGE_REVIEW_INCLUDE_URLS` | No | Cache text-only messages with `http(s)` URLs (default on) |
| `DISCORD_MESSAGE_REVIEW_MAX_ATTACHMENT_MB` | No | Re-upload limit on delete (default **8** MB) |
| `DISCORD_MESSAGE_REVIEW_AUDIT_DELAY_MS` | No | Audit log delay before self-delete check (default **2000** ms) |
| `DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST` | No | Comma-separated or JSON array of hosts; non-invite `http(s)` URLs matching these trigger a **major** hit (empty = disabled) |
| `DISCORD_SPAM_FILTER_CHANNEL_IDS` | No | Comma-separated channel/thread IDs where **consecutive near-duplicate text** from the **same user** (vs previous message in channel via API) counts as **minor** spam: strict normalized equality, or same **letter/digit skeleton** with similar length, or (for long text only) high **Levenshtein similarity**; empty disables. Bot needs **Read Message History** there. |
| `DISCORD_SPAM_FILTER_CHANNEL_OPTIONS_JSON` | No | Per-channel overrides, e.g. `{"channelId":{"crossAuthor":true,"cooldownMs":21600000}}` — **any author**, same duplicate matcher, one similar post per scope within the cooldown (threads share parent scope). Fingerprints are stored in memory and **saved only when `saveState` already runs** (shutdown, mod actions, Exbo updates, etc.), not on every message. |
| `DISCORD_SPAM_FILTER_MAX_FINGERPRINTS_PER_SCOPE` | No | Max stored fingerprints per scope after TTL prune (default **200**) |
| `DISCORD_WARNING_MESSAGE_TTL_MS` | No | Auto-delete delay for ephemeral-style channel notices (default: 12000) |
| `DISCORD_CHANNEL_POLICIES_JSON` | No | Per-channel policies: `blockInviteLinks`, `allowDiscordInvites`, `inviteViolationSeverity`, `blockVideos` / `blockImages` / `blockText`, `mediaViolationSeverity`, `blockedKeywords`, `keywordViolationSeverity`, `allowInviteRoleIds`, `channelPresetId` (channel-purpose text for automod media/text hits), `rulePresetId` (optional server rule line in automod DMs for that channel) |
| `DISCORD_MODERATION_CHANNEL_PRESET_CHANNEL_IDS_JSON` | No | JSON map **channel preset id → channel snowflake** (e.g. `"vidos":"123…"`) for clickable `#channel` links in channel preset text |
| `DISCORD_VOICE_ENABLED` | No | `1` enables join-to-create temp voice; default off |
| `DISCORD_VOICE_HUB_CHANNEL_ID` | No* | Hub voice channel snowflake (join-to-create) |
| `DISCORD_VOICE_TEMP_CATEGORY_ID` | No* | Category for spawned voice/text channels |
| `DISCORD_VOICE_PANEL_CHANNEL_ID` | No | Default channel for `/voicepanel` |
| `DISCORD_VOICE_PANEL_IMAGE_URL` | No | HTTPS legend image in embed; default bundled `assets/discord/voice-panel-legend.png` |
| `DISCORD_VOICE_DEFAULT_NAME` | No | Name template; `{user}` = display name (default `Комната {user}`) |
| `DISCORD_VOICE_EMPTY_DELETE_MS` | No | Delay before deleting empty rooms (default **60000**) |
| `DISCORD_VOICE_MAX_CHANNELS_PER_USER` | No | Max owned rooms per user (default **1**) |
| `DISCORD_VOICE_INVITE_MAX_AGE_SEC` | No | Invite link TTL from panel (default **86400** = 24 h) |
| `DISCORD_CLAN_ENABLED` | No | `1` enables clan role commands + mod review; default off |
| `DISCORD_CLAN_LEADER_ROLE_ID` | Yes* | Snowflake of the shared **«Лидер клана»** meta-role (one role for all clans) |
| `DISCORD_CLAN_ROLE_POSITION_ABOVE_ROLE_ID` | No | Anchor role snowflake — each new clan role is placed **above** this role in the hierarchy (bot’s top role must still be higher) |
| `DISCORD_CLAN_CHAT_CHANNEL_ID` | No | Clan chat channel (e.g. #чат-кланов) — on create, role gets a channel overwrite with **Send Messages** allowed; bot needs **Manage Roles** («Управление правами») and its top role above the new clan role |
| `DISCORD_CLAN_RULES_MESSAGE_ID` | No | Parent rules post snowflake; only the **thread under this post** accepts plain-text clan commands; grant pending messages are posted in that same thread |
| `DISCORD_CLAN_ROLE_EXCLUDE_IDS` | No | Extra role IDs excluded from clan role discovery; always also excludes `DISCORD_MODERATOR_ROLE_IDS`, `DISCORD_ADMIN_ROLE_IDS`, and `DISCORD_STAFF_SUMMARY_CREATOR_ROLE_IDS` |
| `DISCORD_CLAN_ROLE_NAME_PATTERN` | No | Optional regex (case-insensitive) to filter which guild roles count as clans |
| `DISCORD_CLAN_ROSTER_MIN` | No | Min roster size for `!создать` (default **15**) |
| `DISCORD_CLAN_ROSTER_MAX` | No | Max roster size for `!создать` (default **35**) |
| `DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID` | Yes* | Staff channel for new-clan **Принять / Отклонить** review messages |
| `DISCORD_CLAN_STAFF_LOG_CHANNEL_ID` | No | Optional one-line audit for clan actions; falls back to **`DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID`** |
| `DISCORD_CLAN_COLOR_PRESETS_JSON` | No | JSON array override for `!создать` color labels, e.g. `[{"id":"red","label":"Красный","hex":15158332}]`; default built-in Russian presets |
| `LOG_LEVEL` | No | `info` (default), `debug`, or `warn` |
| `PORT` | No | If set, starts an HTTP server on this port that responds `ok` (for health checks) |

\* Required when `DISCORD_CLAN_ENABLED=1`.

\* Required when `DISCORD_VOICE_ENABLED=1`. Setup: [docs/DISCORD_VOICE_SETUP.md](docs/DISCORD_VOICE_SETUP.md) (category, hub, panel, bot permissions, **Guild Voice States** intent).

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
- `/rolepanel channel:<channel> role1:<role> [label1…label6] [role2…role6] [single_role] [embed_*] [image]` — required **`channel`** + **`role1`** first (Discord rule); optional `single_role:true` makes panel roles mutually exclusive (user keeps only one role from that panel); also supports same **`embed_*`** and optional **`image`** file upload as `/post` (attachment above buttons, not inside embed); command opens a modal for optional multiline message text
- `/linkpanel channel:<channel> url1:<https://...> [label1…label5] [url2…url5] [embed_*] [image]` — creates message buttons that open URLs (no role toggle), optional **`image`** attachment like `/post`, then opens a modal for optional multiline message text
- `/editrolepanel channel:<channel> message_id:<snowflake> [role1…role6] [label1…label6] [single_role] [embed_*] [image]` — edit an existing **role panel** message; **per-slot merge**: set only **`roleN`** / **`labelN`** for the button you want to change (others stay); omit all role/label options to keep buttons; modal edits body text (max **2000** chars). Same **`embed_*`** and **`image`** as `/edit` except no **`embed_footer_icon_url`** / **`embed_author_icon_url`** (Discord 25-option cap with six role slots)
- `/editlinkpanel channel:<channel> message_id:<snowflake> [url1…url5] [label1…label5] [embed_*] [image]` — edit an existing **link button** message; **per-slot merge**: set only **`urlN`** / **`labelN`** for the slot to change; full **`embed_*`** and **`image`** like `/edit`
- `/voicepanel [channel]` — publish the **temporary voice** control panel (requires `DISCORD_VOICE_ENABLED=1`; see [docs/DISCORD_VOICE_SETUP.md](docs/DISCORD_VOICE_SETUP.md))
- `/clanpanel [channel]` — publish **clan role command help** in the rules channel (plain-text `+клан` / `-клан` / `!создать`); requires `DISCORD_CLAN_ENABLED=1` and **`DISCORD_CLAN_LEADER_ROLE_ID`**
- `/clanslist` — mod-only list of clan roles with live leader/member counts (requires clan roles enabled)
- `/mute user:<user> duration:<choice> [channel_preset] [rule_preset] [reason] [screenshot] [message_id]` — manual timeout at the chosen duration (not `DISCORD_TIMEOUT_LADDER_MS[tier]`); caps server-wide strikes at **`DISCORD_WARNINGS_BEFORE_TIMEOUT`** and advances the unified ladder tier on success; **`duration`**: 1h, 6h, 12h, 1d, 3d, 7d, 14d, 28d; **`channel_preset`** / **`rule_preset`** autocomplete (empty `channel_preset` → auto channel text from policy); **`reason`** overrides both; optional **`screenshot`** and **`message_id`**
- `/unmute user:<user>` — clears Discord timeout
- `/strike user:<user> [amount] [channel_preset] [rule_preset] [reason] [screenshot] [message_id]` — same light path as automod: +**global** strike(s); warn-only below **`DISCORD_WARNINGS_BEFORE_TIMEOUT`**, else timeout at **`DISCORD_TIMEOUT_LADDER_MS`** current tier; DM title **«Предупреждение»** or **«Наказание»** when timed out; user DM may show **«Нарушение в канале»** and **«Правило сервера (п. X)»** separately
- `/unstrike user:<user> [amount] [reset_warnings] [reset_ladder] [lower_ladder]` — decrease or reset **server-wide** strikes and/or timeout ladder tier
- `/ban user:<user> [channel_preset] [rule_preset] [reason] [screenshot] [message_id] [delete_messages]` — permanent server ban; presets same as **`/mute`**; tries to **DM** the user **before** banning. Optional **`delete_messages`**: Discord bulk-deletes that user’s messages **server-wide** from the last **1 h / 6 h / 12 h / 1 d / 3 d / 1 week** (omit = no bulk delete)
- `/unban user:<user> | user_id:<snowflake>` — remove server ban; specify **either** **`user`** **or** **`user_id`** (use **`user_id`** when the account does not appear in the picker); DM after unban when possible
- `/modstatus user:<user>` — read-only: active Discord **timeout** (with **`<t:…>`** end time), **global** strikes (`n` / **`DISCORD_WARNINGS_BEFORE_TIMEOUT`**), **next** unified ladder step/duration, and last-violation / **decay** hint for **`DISCORD_MODERATION_DECAY_MS`** (no state changed); shows **your** remaining daily quota for `/mute` `/strike` `/ban` when limited

**Daily mod quota:** each moderator (not roles in **`DISCORD_ADMIN_ROLE_IDS`**) may use **`/mute`**, **`/strike`**, and **`/ban`** combined **`DISCORD_MODERATION_DAILY_QUOTA`** times per **UTC calendar day** (default **30**; **`0`** disables). `/unmute`, `/unstrike`, `/unban` are not counted.

**User DMs (staff):** `/mute`, `/strike`, `/unmute`, `/ban`, and `/unban` try to **DM** the target (before ban for **`/ban`**, after successful unban for **`/unban`**) with the same kind of structure as automod where applicable. If DMs are disabled, a short **message is posted in the channel where the command was run** and auto-deleted after **`DISCORD_WARNING_MESSAGE_TTL_MS`** (same as automod fallback).

**Mod log (`DISCORD_MODERATION_LOG_CHANNEL_ID`):** full embeds for automod and manual commands. Automod **Причина** uses raw violation text (not preset copy); user DMs still use presets when configured. Strike count field is **server-wide** (`n` / threshold).

**Staff summary (`DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID`):** one-line digests — manual mod commands link to the matching mod-log message; optional **role create**, **role assign/remove** (tracked staff via audit log), and **creator post** lines do not require the log channel.

**Message review (`DISCORD_MESSAGE_REVIEW_CHANNEL_ID` + `DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_IDS`):** bot caches posts with media or links in RAM (~1 h). If the author **deletes their own message**, a copy is posted to the review channel for moderator follow-up (`/strike`, `/mute`). Automod-deleted messages are not posted here. Cache is cleared on bot restart.

Role-panel definitions, moderation state (**`discordGlobalWarns`**, **`discordMuteTier`**, **`discordModerationLastViolationAt`**, creator-summary cooldown timestamps), temp voice rooms, and **clan role state** (help message IDs, pending grant/create requests) are saved in shared bot state (`file` or Upstash) and restored on restart. Old per-channel warning / dual-tier keys are **not** loaded after deploy (one-time reset).

### Clan roles (`DISCORD_CLAN_ENABLED=1`)

Leader-approved clan workflows (separate from self-serve **`/rolepanel`** toggles):

1. Run **`/clanpanel`** in the rules channel (or pass **`channel`**). Set **`DISCORD_CLAN_RULES_MESSAGE_ID`** to the parent rules post so requests land in its thread.
2. In the **rules thread**, users post plain-text commands:
   - **`+клан Название`** — request a clan role for yourself (pending; leaders/mods click **Одобрить / Отклонить** on the bot message)
   - **`+клан @участник`** — leader of one clan grants to a teammate; **`+клан Название @участник`** — explicit clan (leader/mod)
   - **`-клан`** — remove your role if you have exactly one clan role; **`-клан @участник`** — leader/mod shortcuts per rules; **`-клан Название @участник`** — explicit remove (immediate)
   - **`!создать`** block — line 2: clan name, line 3: color preset label (e.g. `Красный`), then `@mention` roster with 👑 for leaders (**`DISCORD_CLAN_ROSTER_MIN`–`DISCORD_CLAN_ROSTER_MAX`**) → mod review in **`DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID`** (**Принять / Отклонить**). D-rank is checked **manually** by mods.
3. Bot feedback on commands is sent **via DM** (or a short auto-deleted reply if DMs are closed). Other messages in the rules thread are **deleted** and count as a **strike** (same ladder as automod).
3. Grant approval embed shows who resolved the request (**лидер клана** or **модератор**) with a working `@mention` in the message body.

**Leader model:** one shared **«Лидер клана»** role; max **2** leaders per clan (live count). Removing a member’s last clan role also strips the leader meta-role if they no longer lead any clan.

**Bot needs:** **Manage Roles** (role position above clan roles), **Message Content** intent (command parsing and roster `@mention` in the rules thread).

### Discord AutoMod (recommended)

Semantic rules (slurs, cheats, 18+, marketplace phrases) are best handled with **Discord Server Settings → AutoMod** (keyword lists, block/alert, log to a channel). This bot complements AutoMod with mechanical checks (invites, attachments, keyword lists you map in `DISCORD_CHANNEL_POLICIES_JSON`, optional domain blacklist) and staff slash commands. **Light** hits (media/text/keywords/spam) add a **global** strike; at **`DISCORD_WARNINGS_BEFORE_TIMEOUT`** the bot applies **`DISCORD_TIMEOUT_LADDER_MS[tier]`** and advances tier. **Major** hits (invites, blacklisted domains per policy) apply an immediate timeout at **`max(tier, DISCORD_MAJOR_MIN_LADDER_STEP)`** and cap strikes at the threshold. For channel-purpose text in **user DMs**, set **`channelPresetId`** on the channel policy (requires **`DISCORD_MODERATION_CHANNEL_PRESET_CHANNEL_IDS_JSON`**). Optional **`rulePresetId`** adds a **«Правило сервера (п. X)»** block; spam/invites/blacklist hits also attach default rule ids. The **mod log** still records the short automod reason line. Channel preset wording: **`src/discord/moderationReasonPresets.ts`**; rule wording: **`src/discord/moderationRulePresets.ts`**.

## License

MIT
