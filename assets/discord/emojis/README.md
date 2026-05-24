# Voice panel custom emojis

Square **128×128** PNG icons for Discord **Server Settings → Emoji** upload (Discord max recommended size; files must be ≤ 256 KB).

When regenerating artwork, crop to a centered square then export at 128×128 so icons fill the frame (avoid letterboxing).

| File | Suggested emoji name | Panel button |
|------|---------------------|--------------|
| `voice-emoji-name.png` | `voice_name` | Название |
| `voice-emoji-limit.png` | `voice_limit` | Лимит |
| `voice-emoji-access.png` | `voice_access` | Доступ |
| `voice-emoji-region.png` | `voice_region` | Регион |
| `voice-emoji-invite.png` | `voice_invite` | Пригласить |
| `voice-emoji-kick.png` | `voice_kick` | Выгнать |
| `voice-emoji-transfer.png` | `voice_transfer` | Передача |
| `voice-emoji-delete.png` | `voice_delete` | Удалить |
| `voice-emoji-delete-confirm.png` | `voice_delete_ok` | Подтверждение удаления |

## Upload (Discord)

1. **Server Settings → Emoji → Upload Emoji**
2. Upload each PNG (must be ≤ 256 KB; these are 128×128).
3. Use the suggested names above (or your own — update env JSON to match).
4. Copy each emoji’s **ID** (Developer Mode → right‑click emoji → Copy ID).

## Wire into the bot

After upload, set in `.env`:

```env
DISCORD_VOICE_BUTTON_EMOJIS_JSON={"name":{"id":"123","name":"voice_name"},"limit":{"id":"124","name":"voice_limit"},"access":{"id":"125","name":"voice_access"},"region":{"id":"126","name":"voice_region"},"invite":{"id":"127","name":"voice_invite"},"kick":{"id":"128","name":"voice_kick"},"transfer":{"id":"129","name":"voice_transfer"},"delete":{"id":"130","name":"voice_delete"},"deleteConfirm":{"id":"131","name":"voice_delete_ok"}}
```

Restart the bot and run `/voicepanel` again to post buttons with custom emojis.

## Panel legend image

The embed legend (`assets/discord/voice-panel-legend.png`) is built from these emoji PNGs in panel button order. After replacing emoji files, regenerate it:

```bash
npm install sharp --no-save
node scripts/build-voice-legend.mjs
```

Then run `/voicepanel` again.
