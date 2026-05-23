# Temporary voice channels — admin setup

Join-to-create temporary voice rooms with an owner control panel. Feature is off until `DISCORD_VOICE_ENABLED=1` and required channel IDs are set.

## Developer Portal

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → your application → **Bot**.
2. Under **Privileged Gateway Intents**, enable **Server Members Intent** (already required for moderation) and **Guild Voice States** (required for `voiceStateUpdate`).
3. Re-invite the bot if you changed intents and the bot was already on the server.

## Server layout

| Item | Purpose |
|------|---------|
| Category (e.g. `Временные каналы`) | Parent for spawned voice channels |
| Hub voice channel (e.g. `➕ Создать канал`) | Join-to-create trigger; users are moved out immediately |
| Panel text channel (e.g. `#настройка-канала`) | Persistent embed + control buttons (read-only for members) |

Place the hub under or near the panel category so users discover the flow easily.

## Bot role permissions

Bot role should sit **above** temporary channels, **below** admins. On each new temp channel the bot adds an explicit overwrite for itself (View/Connect/Manage Channels) so lock/unlock still work after `@everyone` Connect is denied.

| Permission | Why |
|------------|-----|
| **Manage Channels** | Create, rename, delete voice channels; edit permission overwrites (lock/unlock) |
| **Move Members** | Move user from hub → new room; kick (disconnect) |
| **Connect** + **View Channel** | Operate in the voice category |
| **Create Instant Invite** | Invite links from the panel |
| **Send Messages** + **Embed Links** | Panel message and ephemeral replies |

## Environment

```env
DISCORD_VOICE_ENABLED=1
DISCORD_VOICE_HUB_CHANNEL_ID=<hub voice channel snowflake>
DISCORD_VOICE_TEMP_CATEGORY_ID=<category snowflake>
DISCORD_VOICE_PANEL_CHANNEL_ID=<panel text channel snowflake>
# Optional:
# DISCORD_VOICE_DEFAULT_NAME=Комната {user}
# DISCORD_VOICE_EMPTY_DELETE_MS=60000
# DISCORD_VOICE_MAX_CHANNELS_PER_USER=1
# DISCORD_VOICE_INVITE_MAX_AGE_SEC=86400
```

## Post the panel

An admin runs `/voicepanel` in the guild (optionally with a `channel` argument). The embed includes a **legend image** (bundled PNG or `DISCORD_VOICE_PANEL_IMAGE_URL`) showing what each button does; members use the emoji buttons below the embed to control their room.

Admins and moderators (`DISCORD_ADMIN_ROLE_IDS` / `DISCORD_MODERATOR_ROLE_IDS`) can use any room’s controls as a bypass.

## Behaviour summary

- One active room per user (re-joining the hub moves them back to their existing room).
- **🤝 Передача** transfers channel ownership to another member in the room.
- Empty rooms are deleted after `DISCORD_VOICE_EMPTY_DELETE_MS` (default 60 s).
- On bot restart, empty orphaned **temp** channels in the category are cleaned up (the hub channel `DISCORD_VOICE_HUB_CHANNEL_ID` is never deleted); in-memory delete timers are rescheduled for tracked empty rooms.
