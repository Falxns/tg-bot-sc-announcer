import { DISCORD_VOICE_BUTTON_EMOJIS, type DiscordCustomEmojiRef } from "../../config";

/** Unicode fallback when custom server emojis are not configured. */
export const VOICE_BUTTON_EMOJIS_UNICODE = {
  name: "✏️",
  limit: "👥",
  access: "🔒",
  transfer: "🤝",
  invite: "🔗",
  kick: "👢",
  region: "🌍",
  delete: "🗑️",
  deleteConfirm: "✅",
} as const;

export type VoiceButtonEmojiKey = keyof typeof VOICE_BUTTON_EMOJIS_UNICODE;

export function resolveVoiceButtonEmoji(key: VoiceButtonEmojiKey): string | DiscordCustomEmojiRef {
  return DISCORD_VOICE_BUTTON_EMOJIS[key] ?? VOICE_BUTTON_EMOJIS_UNICODE[key];
}

/** @deprecated Use resolveVoiceButtonEmoji — kept for imports that expect VOICE_BUTTON_EMOJIS. */
export const VOICE_BUTTON_EMOJIS = VOICE_BUTTON_EMOJIS_UNICODE;
