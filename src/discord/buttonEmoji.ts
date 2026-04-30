/**
 * Discord does not render `<:name:id>` / `<a:name:id>` inside button labels.
 * The first match is moved to the component `emoji` field; it is removed from the label text.
 */
const CUSTOM_DISCORD_EMOJI_RE = /<(?<animated>a)?:(?<name>[A-Za-z0-9_]+):(?<id>\d+)>/;

export type ParsedButtonEmoji = {
  id: string;
  name: string;
  animated: boolean;
};

export function peelFirstCustomDiscordEmojiFromLabel(label: string): {
  remainder: string;
  emoji?: ParsedButtonEmoji;
} {
  const m = label.match(CUSTOM_DISCORD_EMOJI_RE);
  if (!m?.groups?.id || !m.groups.name) return { remainder: label };
  const animated = Boolean(m.groups.animated);
  const name = m.groups.name;
  const id = m.groups.id;
  const remainder = label.replace(m[0], "").replace(/\s{2,}/g, " ").trim();
  return { remainder, emoji: { id, name, animated } };
}

const CUSTOM_DISCORD_EMOJI_MARKUP_GLOBAL = /<a?:[A-Za-z0-9_]+:\d+>/g;

/** Human-readable label (e.g. replies) without custom emoji markup. */
export function stripAllCustomDiscordEmojiMarkup(label: string): string {
  return label.replace(CUSTOM_DISCORD_EMOJI_MARKUP_GLOBAL, "").replace(/\s{2,}/g, " ").trim();
}
