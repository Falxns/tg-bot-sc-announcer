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
  { id: "rule_media_flood", point: "2.2", choiceLabel: "п. 2.2 — Спам медиа", shortTitle: "Спам медиа", body: "Несколько медиа подряд без необходимости." },
  { id: "rule_offtopic", point: "2.3", choiceLabel: "п. 2.3 — Оффтоп", shortTitle: "Оффтоп", body: "Сообщения вне темы канала." },
  { id: "rule_ping_abuse", point: "2.4", choiceLabel: "п. 2.4 — Чрезмерный тег участников", shortTitle: "Чрезмерный тег участников", body: "Чрезмерные упоминания без веской причины." },
  { id: "rule_unsafe_links", point: "2.5", choiceLabel: "п. 2.5 — Подозрительные ссылки", shortTitle: "Подозрительные ссылки", body: "Подозрительные ссылки без описания." },
  { id: "rule_recruit_spam", point: "2.6", choiceLabel: "п. 2.6 — Объявления о наборе/поиске 1 раз / 6 ч", shortTitle: "Объявления о наборе/поиске 1 раз / 6 ч", body: "Набор в клан проводится не чаще, чем раз в 6 часов." },
  { id: "rule_personal_attacks", point: "3.1", choiceLabel: "п. 3.1 — Переход на личности", shortTitle: "Переход на личности", body: "Переход на личности в споре." },
  { id: "rule_religion", point: "3.2", choiceLabel: "п. 3.2 — Оскорбление религии, веры", shortTitle: "Оскорбление религии, веры", body: "Провокационное обсуждение религии, веры." },
  { id: "rule_politics", point: "3.3", choiceLabel: "п. 3.3 — Обсуждение/публикация политики в любой форме", shortTitle: "Обсуждение/публикация политики в любой форме", body: "Политика и политический контент." },
  { id: "rule_toxicity_disinfo", point: "3.4", choiceLabel: "п. 3.4 — Токсичность / дезинформация (относится к разработчикам и игре)", shortTitle: "Токсичность / дезинформация (относится к разработчикам и игре)", body: "Токсичность, клевета, дезинформация об игре." },
  { id: "rule_baiting", point: "3.5", choiceLabel: "п. 3.5 — Провокация на нарушение правил др. участников", shortTitle: "Провокация на нарушение правил др. участников", body: "Провокация на нарушение правил." },
  { id: "rule_defamation", point: "3.6", choiceLabel: "п. 3.6 — Клевета/ложь об участниках или администрации", shortTitle: "Клевета/ложь об участниках или администрации", body: "Клевета и ложь об участниках, администрации или ресурсах." },
  { id: "rule_staff_criticism", point: "3.7", choiceLabel: "п. 3.7 — Осуждение действий модерации", shortTitle: "Осуждение действий модерации", body: "Осуждение администрации и/или модерации без доказательств." },
  { id: "rule_doxxing", point: "4.1", choiceLabel: "п. 4.1 — Распространение личной информации", shortTitle: "Распространение личной информации", body: "Распространение личной информации без согласия владельца." },
  { id: "rule_impersonation", point: "4.2", choiceLabel: "п. 4.2 — Выдача себя за другого участника или администратора", shortTitle: "Выдача себя за другого участника или администратора", body: "Выдача себя за другого, фейки." },
  { id: "rule_nsfw", point: "4.3", choiceLabel: "п. 4.3 — NSFW: насилие, порнография, шок-контент", shortTitle: "NSFW: насилие, порнография, шок-контент", body: "NSFW: насилие, порнография, шок-контент." },
  { id: "rule_irl_threats", point: "4.4", choiceLabel: "п. 4.4 — Угрозы в реальной жизни", shortTitle: "Угрозы в реальной жизни", body: "Угрозы расправой в реальной жизни." },
  { id: "rule_external_ads", point: "5.1", choiceLabel: "п. 5.1 — Реклама", shortTitle: "Реклама", body: "Реклама без согласования с администрацией." },
  { id: "rule_scam", point: "5.2", choiceLabel: "п. 5.2 — Скам / фишинг", shortTitle: "Скам / фишинг", body: "Скам, фишинг, вредоносные ссылки." },
  { id: "rule_rmt_accounts", point: "5.3", choiceLabel: "п. 5.3 — Продажа ценностей за реал", shortTitle: "Продажа ценностей за реал", body: "Продажа аккаунтов, валюты, ценностей за реальные деньги." },
  { id: "rule_begging", point: "5.4", choiceLabel: "п. 5.4 — Самофорс и попрошайничество", shortTitle: "Самофорс и попрошайничество", body: "Попрошайничество и навязчивые просьбы." },
  { id: "rule_exploit_abuse", point: "5.5", choiceLabel: "п. 5.5 — Использование багов в личных целях", shortTitle: "Использование багов в личных целях", body: "Использование багов в личных целях." },
  { id: "rule_illegal_rf", point: "6.1", choiceLabel: "п. 6.1 — Запрещённый контент РФ", shortTitle: "Запрещённый контент РФ", body: "Контент, запрещённый законодательством РФ." },
  { id: "rule_cheats_black_market", point: "6.2", choiceLabel: "п. 6.2 — Нарушение правил EXBO (Черный рынок/читы/баги)", shortTitle: "Нарушение правил EXBO (Черный рынок/читы/баги)", body: "Читы, баги, чёрный рынок EXBO." },
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
