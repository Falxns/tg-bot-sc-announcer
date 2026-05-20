import type { ApplicationCommandOptionChoiceData } from "discord.js";
import { DISCORD_CHANNEL_POLICIES, DISCORD_MODERATION_CHANNEL_PRESET_CHANNEL_IDS } from "../config";

/** Channel-purpose preset (`#видосы`, trade channels, …). */
export type ModerationChannelPreset = {
  id: string;
  choiceLabel: string;
  channelSlug: string;
  body: string;
};

const CHANNEL_PLACEHOLDER = "{channel}";

export const MODERATION_CHANNEL_PRESETS: readonly ModerationChannelPreset[] = [
  {
    id: "vidos",
    choiceLabel: "#видосы — видеоролики",
    channelSlug: "видосы",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации видеороликов, связанных с STALCRAFT: X.",
  },
  {
    id: "streamy",
    choiceLabel: "#стримы — трансляции",
    channelSlug: "стримы",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации объявлений о начале трансляций, связанных с STALCRAFT: X.",
  },
  {
    id: "tvorchestvo",
    choiceLabel: "#творчество",
    channelSlug: "творчество",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации творчества, связанного с STALCRAFT: X.",
  },
  {
    id: "skrinshoty",
    choiceLabel: "#скриншоты",
    channelSlug: "скриншоты",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации скриншотов, связанных с STALCRAFT: X.",
  },
  {
    id: "videozapisi",
    choiceLabel: "#видеозаписи",
    channelSlug: "видеозаписи",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации видеозаписей, связанных с STALCRAFT: X.",
  },
  {
    id: "memy",
    choiceLabel: "#мемы",
    channelSlug: "мемы",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации мемов и смешных ситуаций, связанных с STALCRAFT: X.",
  },
  {
    id: "obshchiy_chat",
    choiceLabel: "#общий-чат",
    channelSlug: "общий-чат",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для общения между участниками сервера.",
  },
  {
    id: "otsenka_sborok",
    choiceLabel: "#оценка-сборок",
    channelSlug: "оценка-сборок",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации и оценки сборок, связанных со STALCRAFT: X.",
  },
  {
    id: "chat_liderov",
    choiceLabel: "#чат-лидеров",
    channelSlug: "чат-лидеров",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для общения между лидерами подразделений STALCRAFT: X.",
  },
  {
    id: "nabor_klany",
    choiceLabel: "#набор-в-кланы",
    channelSlug: "набор-в-кланы",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации объявлений о наборе в подразделения STALCRAFT: X.",
  },
  {
    id: "poisk_klanov",
    choiceLabel: "#поиск-кланов",
    channelSlug: "поиск-кланов",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации объявлений о поиске подразделений STALCRAFT: X.",
  },
  {
    id: "poisk_timmeitov",
    choiceLabel: "#поиск-тиммейтов",
    channelSlug: "поиск-тиммейтов",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации объявлений о поиске тиммейтов STALCRAFT: X.",
  },
  {
    id: "obshchee",
    choiceLabel: "#общее — торговля",
    channelSlug: "общее",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации общих торговых объявлений, связанных с STALCRAFT: X.",
  },
  {
    id: "prodazha",
    choiceLabel: "#продажа",
    channelSlug: "продажа",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации торговых объявлений о продаже, связанных с STALCRAFT: X.",
  },
  {
    id: "pokupka",
    choiceLabel: "#покупка",
    channelSlug: "покупка",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации торговых объявлений о покупке, связанных с STALCRAFT: X.",
  },
  {
    id: "obmen",
    choiceLabel: "#обмен",
    channelSlug: "обмен",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации объявлений об обмене, связанных с STALCRAFT: X.",
  },
  {
    id: "uslugi",
    choiceLabel: "#услуги",
    channelSlug: "услуги",
    body: "Ваше сообщение было удалено: канал {channel} предназначен для публикации объявлений об оказании услуг, связанных с STALCRAFT: X.",
  },
] as const;

const PRESET_BY_ID = new Map<string, ModerationChannelPreset>(
  MODERATION_CHANNEL_PRESETS.map((p) => [p.id, p]),
);

const AUTOCOMPLETE_MAX = 25;

export function isKnownChannelPresetId(id: string): boolean {
  return PRESET_BY_ID.has(id);
}

export function getChannelPresetById(id: string): ModerationChannelPreset | undefined {
  return PRESET_BY_ID.get(id);
}

/** Channel snowflake for preset link: env map, else fallback scope channel. */
export function channelIdForChannelPreset(presetId: string, fallbackChannelId?: string): string | undefined {
  const mapped = DISCORD_MODERATION_CHANNEL_PRESET_CHANNEL_IDS[presetId];
  if (mapped) return mapped;
  return fallbackChannelId;
}

export function buildChannelPurposeReason(presetId: string, channelId: string): string | undefined {
  const preset = PRESET_BY_ID.get(presetId);
  if (!preset) return undefined;
  const mention = `<#${channelId}>`;
  return preset.body.split(CHANNEL_PLACEHOLDER).join(mention);
}

export function channelPresetIdForChannel(channelId: string): string | undefined {
  const policy = DISCORD_CHANNEL_POLICIES[channelId];
  const id = policy?.channelPresetId?.trim();
  if (!id || !PRESET_BY_ID.has(id)) return undefined;
  return id;
}

/** Channel-purpose presets (`#видосы`, …) for `channel_preset` autocomplete. */
export function filterChannelPresetAutocomplete(query: string): ApplicationCommandOptionChoiceData[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? MODERATION_CHANNEL_PRESETS.filter(
        (p) =>
          p.choiceLabel.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.channelSlug.toLowerCase().includes(q),
      )
    : [...MODERATION_CHANNEL_PRESETS];
  return matched.slice(0, AUTOCOMPLETE_MAX).map((p) => ({
    name: p.choiceLabel.slice(0, 100),
    value: p.id,
  }));
}

/** Embed-safe reason: escape prose but keep channel mentions intact. */
export function formatReasonForEmbed(reason: string): string {
  if (!reason.includes("<#")) return escapeMarkdownForReason(reason);
  const parts = reason.split(/(<#\d{17,20}>)/g);
  return parts.map((part) => (part.startsWith("<#") ? part : escapeMarkdownForReason(part))).join("");
}

function escapeMarkdownForReason(text: string): string {
  return text.replace(/([\\*_`~|])/g, "\\$1");
}

export function formatChannelLineForEmbed(channelId: string, label: string): string {
  return `**${label}:** <#${channelId}>`;
}

/** Plain text for Discord audit log (timeouts/bans); strips channel mention markup. */
export function reasonPlainTextForAudit(reason: string): string {
  return reason.replace(/<#(\d{17,20})>/g, "#channel").slice(0, 512);
}
