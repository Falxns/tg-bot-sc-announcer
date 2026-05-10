/**
 * Discord text shown to users: slash command UI, ephemeral replies, modals,
 * automation DMs/channel notices, role buttons, and moderation log labels.
 * Adjust wording here without touching handler logic.
 */

/** Shared `/post`, `/rolepanel`, `/linkpanel` embed-related option descriptions. */
export const discordSlashEmbedOptions = {
  embedTitle: "Заголовок embed (необязательно)",
  embedDescription: "Описание embed (необязательно)",
  embedUrl: "Ссылка в заголовке embed (необязательно)",
  embedColor: "Цвет embed: #RRGGBB или десятичное число",
  embedThumbnailUrl: "URL миниатюры embed (справа сверху)",
  embedImageUrl: "URL большого изображения embed",
  embedFooter: "Текст подвала embed",
  embedFooterIconUrl: "URL иконки подвала embed",
  embedAuthorName: "Строка автора embed (сверху)",
  embedAuthorIconUrl: "URL иконки автора embed",
} as const;

export const discordSlashPost = {
  commandDescription: "Отправить сообщение от имени бота в выбранный канал.",
  channel: "Канал для публикации",
  image: "Файл/картинка (к первому сообщению, необязательно)",
  modalTitle: "Публикация сообщения",
  modalBodyLabel: "Текст (необязательно, если есть файл)",
} as const;

export const discordSlashRolePanel = {
  commandDescription: "Создать сообщение с кнопками выдачи ролей.",
  channel: "Канал для сообщения",
  role: (n: number) => `Роль №${n}`,
  roleButtonLabel: (n: number) => `Подпись кнопки для роли №${n}`,
  singleRole: "Разрешить только одну роль из этой панели (взаимоисключающие роли)",
  modalTitle: "Панель ролей — текст сообщения",
  modalBodyLabel: "Текст над кнопками (необязательно, если задан embed)",
} as const;

export const discordSlashLinkPanel = {
  commandDescription: "Создать сообщение с кнопками-ссылками (открывают URL в браузере).",
  channel: "Канал для сообщения",
  url: (n: number) => (n === 1 ? "Ссылка №1 (https://…)" : `Ссылка №${n} (необязательно)`),
  buttonLabel: (n: number) => `Подпись кнопки №${n}`,
  modalTitle: "Кнопки-ссылки — текст сообщения",
  modalBodyLabel: "Текст над кнопками (необязательно, если задан embed)",
  linkFallbackLabel: "Ссылка",
} as const;

export const discordSlashModeration = {
  userOption: "Пользователь",
  mute: {
    commandDescription: "Выдать таймаут пользователю (без изменения авто-лестниц).",
    duration: "Длительность таймаута",
    reason: "Причина",
    screenshot: "Скриншот нарушения — приложится к записи в лог модерации",
    logLastMessage:
      "Добавить в лог модерации копию последнего сообщения пользователя в этом канале (до 100 сообщений истории), со ссылкой — оригинал можно удалить",
  },
  unmute: {
    commandDescription: "Снять таймаут с пользователя.",
  },
  warn: {
    commandDescription: "Добавить минор-предупреждение пользователю в канале.",
    channel: "Канал учёта (по умолчанию текущий)",
    amount: "Сколько добавить (1–20)",
    reason: "Причина",
  },
  unwarn: {
    commandDescription: "Уменьшить или сбросить минор-предупреждения пользователя в канале.",
    channel: "Канал учёта (по умолчанию текущий)",
    amount: "На сколько уменьшить (1–20)",
    clear: "Сбросить счётчик в этом канале",
  },
} as const;

/** Values are minute counts as strings (Discord choice values). */
export const discordMuteDurationChoices: ReadonlyArray<{ name: string; value: string }> = [
  { name: "1 час", value: "60" },
  { name: "6 часов", value: "360" },
  { name: "12 часов", value: "720" },
  { name: "1 день", value: "1440" },
  { name: "3 дня", value: "4320" },
  { name: "7 дней", value: "10080" },
  { name: "14 дней", value: "20160" },
  { name: "28 дней", value: "40320" },
];

export function discordModerationLogChannelFieldValue(channelId: string, parentChannelId?: string): string {
  if (parentChannelId) {
    return `<#${channelId}> (ветка, родитель <#${parentChannelId}>)`;
  }
  return `<#${channelId}>`;
}

export const discordModerationLogFields = {
  user: "Пользователь",
  channel: "Канал",
  type: "Тип",
  minorWarningsChannel: "Предупреждений (минор, канал)",
  minorTier: "Minor tier",
  majorTier: "Major tier",
  timeout: "Таймаут",
  timeoutMinutes: (m: number) => `${m} мин`,
  message: "Сообщение",
  excerpt: "Фрагмент",
  moderator: "Модератор",
} as const;

export const discordModerationLogTitles = {
  staffMute: "Staff: /mute",
  staffUnmute: "Staff: /unmute",
  staffWarn: "Staff: /warn",
  staffUnwarn: "Staff: /unwarn",
  majorTimeout: "Major: таймаут",
  minorWarnOnly: "Minor: предупреждение",
  minorWarnTimeout: "Minor: предупреждение + таймаут",
} as const;

export const discordCommonReplies = {
  guildOnly: "Только на сервере.",
  guildOnlyCommand: "Эта команда доступна только на сервере.",
  noPermission: "У вас нет прав на эту команду.",
  wrongGuild: "Неверный сервер.",
  channelNotText: "Этот канал не подходит для текстовых сообщений.",
  modalStalePost: "Форма устарела или уже использована. Запустите `/post` снова.",
  modalStaleRolePanel: "Форма устарела или уже использована. Запустите `/rolepanel` снова.",
  modalStaleLinkPanel: "Форма устарела или уже использована. Запустите `/linkpanel` снова.",
  modalWrongInvokerPost: "Отправить форму может только тот, кто вызвал `/post`.",
  modalWrongInvokerRolePanel: "Отправить форму может только тот, кто вызвал `/rolepanel`.",
  modalWrongInvokerLinkPanel: "Отправить форму может только тот, кто вызвал `/linkpanel`.",
  postModalNeedsContent:
    "Добавьте текст в форму, прикрепите файл в `/post` и/или задайте параметры embed (например `embed_title`, `embed_description`, `embed_image_url`).",
  panelModalNeedsContent:
    "Добавьте текст в форму и/или задайте embed в команде (например `embed_title`, `embed_description`, `embed_image_url`).",
  channelUnavailable: "Канал больше недоступен.",
  internalError: "Произошла внутренняя ошибка.",
} as const;

export function discordFmtPostPublished(opts: {
  channelId: string;
  totalParts: number;
  attachmentCount: number;
  hasEmbed: boolean;
}): string {
  return `Опубликовано в <#${opts.channelId}>. Сообщений: ${opts.totalParts}, вложений: ${opts.attachmentCount}${opts.hasEmbed ? ", с embed" : ""}.`;
}

export function discordFmtAttachmentPrepFail(err: unknown): string {
  return `Не удалось подготовить вложения: ${err instanceof Error ? err.message : String(err)}`;
}

export function discordFmtChannelSendFail(err: unknown): string {
  return `Не удалось отправить в канал: ${err instanceof Error ? err.message : String(err)}`;
}

export function discordFmtRolePanelCreated(channelId: string, buttonCount: number): string {
  return `Панель ролей создана в <#${channelId}> (${buttonCount} кнопок).`;
}

export function discordFmtRolePanelWrongChannel(channelId: string): string {
  return `Панель ролей разрешена только в канале <#${channelId}>.`;
}

export function discordFmtLinkPanelDone(channelId: string, linkCount: number): string {
  return `Сообщение с кнопками-ссылками отправлено в <#${channelId}> (${linkCount} кнопок).`;
}

export const discordLinkPanelErrors = {
  url1Invalid: "Некорректная ссылка в `url1`: нужен http(s) URL длиной не больше 512 символов.",
  needOneLink: "Укажите хотя бы одну корректную ссылку.",
} as const;

export const discordRolePanelErrors = {
  needOneRole: "Укажите хотя бы одну роль.",
} as const;

export const discordRoles = {
  panelUnknown:
    "Эта кнопка роли не зарегистрирована у бота (состояние потеряли после перезапуска или сообщение не удалось восстановить). Попросите модератора снова выполнить `/rolepanel`.",
  buttonWrongPanel:
    "Эта кнопка не относится к сохранённой панели ролей для этого сообщения. Попробуйте снова `/rolepanel`.",
  wrongGuild: "Эта панель ролей относится к другому серверу.",
  memberResolveFailed: "Не удалось определить ваш профиль участника на этом сервере.",
  roleMissing: "Роль не найдена (возможно, удалена). Создайте панель заново через `/rolepanel`.",
  botMemberFailed:
    "Не удалось загрузить профиль бота на сервере. Проверьте, что бот в гильдии и при необходимости включён интент **Участники сервера** (Server Members Intent).",
  roleRemoved: (label: string) => `Роль снята: ${label}`,
  roleAdded: (label: string) => `Роль выдана: ${label}`,
  fallbackRoleLabel: "роль",
  noManageRoles:
    "У этого бота нет права **Управлять ролями** на сервере. Включите его в **Настройки сервера → Интеграции** (или выдайте роли бота это право).",
  hierarchyTarget:
    "Бот не может менять ваши роли из‑за **порядка ролей**: ваша **самая высокая** роль должна быть **ниже** самой высокой роли бота. Поднимите роль бота выше в **Настройки сервера → Роли**.",
  roleManaged: (name: string) =>
    `Роль **${name}** **управляется** Discord (интеграция, подписка и т.п.) — бот не может её выдавать или снимать.`,
  roleNotEditable: (name: string) =>
    `Роль бота должна быть **выше** роли **${name}** в **Настройки сервера → Роли** (перетащите роль бота выше), чтобы бот мог выдавать или снимать эту роль.`,
  apiGeneric: "Не удалось изменить роль. Обратитесь к администраторам сервера.",
  apiRateLimit: "Discord ограничил частоту действий. Подождите немного и попробуйте снова.",
  apiForbidden:
    "Discord отклонил действие (**нет доступа / прав**). Обычно помогает: (1) у бота есть **Управлять ролями**, (2) роль бота **выше** роли на кнопке, (3) ваша верхняя роль **ниже** верхней роли бота.",
} as const;

export const discordModerationCommands = {
  unknownError: "неизвестно",
  defaultMuteReason: "Ручной мут модератором",
  unmuteReason: "Снят модератором",
  warnDefaultReason: "Предупреждение модератором",
  unmuteLogReason: "Снят таймаут",
  unwarnReasonIncrement: (n: number) => `−${n}`,
  unwarnReasonClear: "Сброс предупреждений",
  guildOnly: "Только на сервере.",
  scopeNeedTextChannel: "Укажите текстовый канал или ветку.",
  scopeChannelUnknown: "Не удалось определить канал.",
  muteBot: "Нельзя замутить бота.",
  badDuration: "Некорректная длительность.",
  userNotInGuild: "Пользователь не на сервере.",
  muteNotModeratable: "Не могу изменить таймаут этого пользователя (роль выше?).",
  muteTimeoutFail: (err: string) => `Не удалось выдать таймаут: ${err}`,
  unmuteBadTarget: "Некорректная цель.",
  unmuteNotModeratable: "Не могу снять таймаут (роль выше?).",
  unmuteFail: (err: string) => `Не удалось снять таймаут: ${err}`,
  unmuteDone: (userId: string) => `Таймаут снят с <@${userId}>.`,
  warnCounts: (userId: string, scopeId: string, before: number, after: number) =>
    `Предупреждения <@${userId}> в <#${scopeId}>: ${before} → ${after}.`,
  lastMessageChannelUnsupported: "В этом канале нельзя прочитать историю сообщений для копии.",
  lastMessageNotFound: "Нет сообщений пользователя среди последних 100 в канале.",
  lastMessageLoggedNote:
    "\nВ лог модерации добавлены ссылка и копия последнего сообщения пользователя.",
  lastMessageNoLogEnv:
    "\nКопия сообщения не попадёт в лог: не задан DISCORD_MODERATION_LOG_CHANNEL_ID.",
  lastMessageFailNote: (err: string) => `\nНе удалось добавить копию сообщения в лог — ${err}`,
  screenshotLogged: "\nСкриншот добавлен к записи в лог модерации.",
  screenshotNoLogEnv: "\nСкриншот не попадёт в лог: не задан DISCORD_MODERATION_LOG_CHANNEL_ID.",
  muteSnapshotEmpty: "(нет текста; есть только вложения/embed/стикеры — см. ссылку на сообщение)",
  muteDone: (durLabel: string, userId: string, evidenceNote: string, shotNote: string) =>
    `Таймаут **${durLabel}** (<@${userId}>).${evidenceNote}${shotNote}`,
  minutesFallback: (n: number) => `${n} мин`,
  screenshotFileFallback: "screenshot",
} as const;

export const discordAutoMod = {
  spamDuplicateReason: "Повтор одного и того же сообщения подряд (спам).",
  invitesForbidden: "В этом канале запрещены приглашения Discord.",
  forbiddenDomain: (host: string) => `Ссылка на запрещённый домен: ${host}`,
  videoForbidden: "В этом канале запрещены видеовложения.",
  imageForbidden: "В этом канале запрещены изображения.",
  textForbidden: "В этом канале запрещены текстовые сообщения.",
  keywordHit: (word: string) => `Обнаружено запрещённое слово: «${word}».`,
  timeoutMajor: (reason: string) => `Автомодерация (major): ${reason}`,
  timeoutMinor: (reason: string) => `Автомодерация (minor): ${reason}`,
  guildFallbackName: "Сервер",
  embedFooter: "Автоматическая модерация",
  titleMajor: "Серьёзное нарушение",
  titleMinor: "Предупреждение",
  labelServer: "Сервер",
  labelChannel: "Канал",
  labelNick: "Ник на сервере",
  labelReason: "Причина",
  labelWarnCount: (count: number, threshold: number) =>
    `**Предупреждения в этом канале:** **${count}** (порог таймаута: **${threshold}**).`,
  labelTimeout: "Таймаут",
  timeoutApplyFail: "**Таймаут:** не удалось применить (ошибка Discord API).",
  timeoutNotModeratable:
    "**Таймаут:** не применён — бот не может замутить этого пользователя (проверьте иерархию ролей).",
} as const;

/** Human-readable duration for automod user embeds (Russian). */
export function discordFormatDurationRu(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} мин.`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (totalMin < 1440) return m > 0 ? `${h} ч ${m} мин.` : `${h} ч`;
  const d = Math.floor(totalMin / 1440);
  const remH = Math.floor((totalMin % 1440) / 60);
  return remH > 0 ? `${d} д ${remH} ч` : `${d} д`;
}
