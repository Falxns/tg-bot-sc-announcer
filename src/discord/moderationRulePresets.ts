import type { ApplicationCommandOptionChoiceData } from "discord.js";

/** Server-wide STALCRAFT MEDIA rule (by point). Wording in `body` is filled in later. */
export type ModerationRulePreset = {
  id: string;
  point: string;
  choiceLabel: string;
  shortTitle: string;
  body: string;
};

export const MODERATION_RULE_PRESETS: readonly ModerationRulePreset[] = [
  { id: "rule_spam", point: "2.1", choiceLabel: "п. 2.1 — Спам", shortTitle: "Спам", body: "Спам и однотипные сообщения." },
  { id: "rule_media_flood", point: "2.2", choiceLabel: "п. 2.2 — Медиа подряд", shortTitle: "Медиа подряд", body: "Несколько медиа подряд без необходимости." },
  { id: "rule_offtopic", point: "2.3", choiceLabel: "п. 2.3 — Оффтоп", shortTitle: "Оффтоп", body: "Сообщения не по назначению канала." },
  { id: "rule_ping_abuse", point: "2.4", choiceLabel: "п. 2.4 — Чрезмерные упоминания", shortTitle: "Чрезмерные упоминания", body: "Чрезмерные упоминания без веской причины." },
  { id: "rule_unsafe_links", point: "2.5", choiceLabel: "п. 2.5 — Подозрительные ссылки", shortTitle: "Подозрительные ссылки", body: "Подозрительные ссылки без описания." },
  { id: "rule_recruit_spam", point: "2.6", choiceLabel: "п. 2.6 — Набор 1 раз/6 ч", shortTitle: "Набор 1 раз/6 ч", body: "Набор в клан чаще раза в 6 часов." },
  { id: "rule_hate_speech", point: "3.1", choiceLabel: "п. 3.1 — Хейтспич / Травля", shortTitle: "Хейтспич / Травля", body: "Хейтспич и травля участников." },
  { id: "rule_personal_attacks", point: "3.2", choiceLabel: "п. 3.2 — Переход на личности", shortTitle: "Переход на личности", body: "Переход на личности в споре." },
  { id: "rule_religion", point: "3.3", choiceLabel: "п. 3.3 — Религия", shortTitle: "Религия", body: "Провокационное обсуждение религии." },
  { id: "rule_politics", point: "3.4", choiceLabel: "п. 3.4 — Политика", shortTitle: "Политика", body: "Политика и политический контент." },
  { id: "rule_toxicity_disinfo", point: "3.5", choiceLabel: "п. 3.5 — Токсичность / дезинформация", shortTitle: "Токсичность / дезинформация", body: "Токсичность, клевета, дезинформация об игре." },
  { id: "rule_baiting", point: "3.6", choiceLabel: "п. 3.6 — Провокация", shortTitle: "Провокация", body: "Провокация на нарушение правил." },
  { id: "rule_defamation", point: "3.7", choiceLabel: "п. 3.7 — Клевета / Ложь", shortTitle: "Клевета / Ложь", body: "Клевета и ложь об участниках." },
  { id: "rule_staff_criticism", point: "3.8", choiceLabel: "п. 3.8 — Осуждение модерации", shortTitle: "Осуждение модерации", body: "Осуждение модерации без доказательств." },
  { id: "rule_doxxing", point: "4.1", choiceLabel: "п. 4.1 — Личные данные", shortTitle: "Личные данные", body: "Распространение личной информации без согласия владельца." },
  { id: "rule_impersonation", point: "4.2", choiceLabel: "п. 4.2 — Выдача себя за другого", shortTitle: "Имперсонация", body: "Выдача себя за другого, фейки." },
  { id: "rule_nsfw", point: "4.3", choiceLabel: "п. 4.3 — NSFW", shortTitle: "NSFW", body: "NSFW: насилие, порнография, шок-контент." },
  { id: "rule_irl_threats", point: "4.4", choiceLabel: "п. 4.4 — Угрозы в реале", shortTitle: "Угрозы в реале", body: "Угрозы расправой в реальной жизни." },
  { id: "rule_external_ads", point: "5.1", choiceLabel: "п. 5.1 — Реклама", shortTitle: "Реклама", body: "Реклама без согласования с администрацией." },
  { id: "rule_scam", point: "5.2", choiceLabel: "п. 5.2 — Скам / фишинг", shortTitle: "Скам / фишинг", body: "Скам, фишинг, вредоносные ссылки." },
  { id: "rule_rmt_accounts", point: "5.3", choiceLabel: "п. 5.3 — Продажа ценностей", shortTitle: "Продажа ценностей", body: "Продажа аккаунтов, валюты, ценностей за реальные деньги." },
  { id: "rule_begging", point: "5.4", choiceLabel: "п. 5.4 — Попрошайничество", shortTitle: "Попрошайничество", body: "Попрошайничество и навязчивые просьбы." },
  { id: "rule_exploit_abuse", point: "5.5", choiceLabel: "п. 5.5 — Баги", shortTitle: "Баги", body: "Использование багов в личных целях." },
  { id: "rule_illegal_rf", point: "6.1", choiceLabel: "п. 6.1 — Запрещённый контент РФ", shortTitle: "Запрещённый контент РФ", body: "Контент, запрещённый законодательством РФ." },
  { id: "rule_cheats_black_market", point: "6.2", choiceLabel: "п. 6.2 — Читы / чёрный рынок", shortTitle: "Читы / чёрный рынок", body: "Читы, баги, чёрный рынок EXBO." },
  { id: "rule_evasion", point: "6.3", choiceLabel: "п. 6.3 — Обход наказания / альт-аккаунты", shortTitle: "Обход наказания / альт-аккаунты", body: "Обход наказания, альт-аккаунты." },
  { id: "rule_voice_noise", point: "7.1", choiceLabel: "п. 7.1 — Звуки в войсе", shortTitle: "Звуки в войсе", body: "Раздражающие звуки в голосовых каналах." },
  { id: "rule_voice_flood", point: "7.2", choiceLabel: "п. 7.2 — Флуд в войсе", shortTitle: "Флуд в войсе", body: "Флуд звуками или громкой музыкой." },
  { id: "rule_voice_afk_noise", point: "7.3", choiceLabel: "п. 7.3 — Фон в войсе", shortTitle: "Фон в войсе", body: "Фоновый шум без общения в войсе." },
  { id: "rule_voice_ads", point: "7.4", choiceLabel: "п. 7.4 — Реклама в войсе", shortTitle: "Реклама в войсе", body: "Реклама или скам в голосовых каналах." },
  { id: "rule_other", point: "1.6", choiceLabel: "п. 1.6 — Иное (прецедент)", shortTitle: "Иное", body: "Нарушение правил по прецеденту." },
] as const;

/** Automod detector → default rule preset id. */
export const AUTOMOD_RULE_PRESET_IDS = {
  spam: "rule_spam",
  recruitSpam: "rule_recruit_spam",
  invites: "rule_external_ads",
  forbiddenDomain: "rule_scam",
} as const;

const RULE_BY_ID = new Map<string, ModerationRulePreset>(MODERATION_RULE_PRESETS.map((p) => [p.id, p]));

const AUTOCOMPLETE_MAX = 25;

export function isKnownRulePresetId(id: string): boolean {
  return RULE_BY_ID.has(id);
}

export function getRulePresetById(id: string): ModerationRulePreset | undefined {
  return RULE_BY_ID.get(id);
}

export function ruleSectionLabel(point: string): string {
  return `Правило сервера (п. ${point})`;
}

export function buildRuleUserReason(presetId: string): string | undefined {
  const preset = RULE_BY_ID.get(presetId);
  if (!preset) return undefined;
  const body = preset.body.trim();
  if (body.length > 0 && body !== "—") return body;
  return `Нарушение п. ${preset.point}.`;
}

export function filterRulePresetAutocomplete(query: string): ApplicationCommandOptionChoiceData[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? MODERATION_RULE_PRESETS.filter(
        (p) =>
          p.choiceLabel.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.point.includes(q) ||
          p.shortTitle.toLowerCase().includes(q),
      )
    : [...MODERATION_RULE_PRESETS];
  return matched.slice(0, AUTOCOMPLETE_MAX).map((p) => ({
    name: p.choiceLabel.slice(0, 100),
    value: p.id,
  }));
}
