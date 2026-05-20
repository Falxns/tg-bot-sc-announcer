/**
 * Discord text shown to users: slash command UI, ephemeral replies, modals,
 * automation DMs/channel notices, role buttons, and moderation log labels.
 * Adjust wording here without touching handler logic.
 */

/** Shared `/post`, `/rolepanel`, `/linkpanel` embed-related option descriptions. */
export const discordSlashEmbedOptions = {
  embedTitle: "Заголовок",
  embedDescription: "Основной текст",
  embedUrl: "URL заголовка",
  embedColor: "Цвет: #RRGGBB",
  embedThumbnailUrl: "URL миниатюры (справа сверху)",
  embedImageUrl: "URL большого изображения (внизу)",
  embedFooter: "Текст футера",
  embedFooterIconUrl: "URL иконки футера",
  embedAuthorName: "Автор (над заголовком)",
  embedAuthorIconUrl: "URL иконки автора",
} as const;

export const discordSlashPost = {
  commandDescription: "Сообщение от имени бота в выбранный канал.",
  channel: "Канал для публикации",
  image: "Фотография (необязательно)",
  modalTitle: "Ввод текста сообщения",
  modalBodyLabel: "Текст сообщения",
} as const;

export const discordSlashEdit = {
  commandDescription: "Изменить существующее сообщение. Указанные поля embed заменяются, остальные сохраняются.",
  channel: "Канал с сообщением",
  messageId: "ID сообщения (ПКМ по сообщению → Копировать ID; включите режим разработчика в Discord)",
  image: "Новый файл (необязательно; заменит вложения, если указан)",
  modalTitle: "Редактирование сообщения",
  modalBodyLabel: "Новый текст сообщения",
  messageNotFound: "Сообщение не найдено или недоступно.",
  notBotsMessage: "Редактировать можно только сообщения, отправленные этим ботом.",
  invalidMessageId: "Некорректный ID сообщения.",
  bodyTooLong: "Текст длиннее 2000 символов — это одно сообщение Discord; сократите текст.",
} as const;

export const discordSlashRolePanel = {
  commandDescription: "Сообщение с кнопками выдачи ролей.",
  channel: "Канал для публикации",
  role: (n: number) => `Роль №${n}`,
  roleButtonLabel: (n: number) => `Видимый текст для кнопки №${n}`,
  singleRole: "Выдавать только одну роль из всей панели (другие роли будут сняты)",
  modalTitle: "Панель ролей — ввод текста сообщения",
  modalBodyLabel: "Текст сообщения (необязательно, если задан embed)",
} as const;

export const discordSlashLinkPanel = {
  commandDescription: "Сообщение с кнопками-ссылками.",
  channel: "Канал для публикации",
  url: (n: number) => (n === 1 ? "URL №1 (https://…)" : `URL №${n} (необязательно)`),
  buttonLabel: (n: number) => `Видимый текст для кнопки №${n}`,
  modalTitle: "Кнопки-ссылки — ввод текста сообщения",
  modalBodyLabel: "Текст сообщения (необязательно, если задан embed)",
  linkFallbackLabel: "Ссылка",
} as const;

export const discordSlashModeration = {
  userOption: "Пользователь",
  mute: {
    commandDescription: "Выдать таймаут пользователю.",
    duration: "Длительность таймаута",
    channelPreset: "Шаблон канала (начните вводить для поиска)",
    rulePreset: "Правило сервера (начните вводить для поиска)",
    reason: "Своя причина (перекрывает шаблоны)",
    screenshot: "Скриншот нарушения (необязательно)",
    messageId: "ID сообщения нарушителя в текущем канале/треде; сообщение будет удалено автоматически",
  },
  unmute: {
    commandDescription: "Снять таймаут с пользователя.",
  },
  strike: {
    commandDescription: "Выдать наказание пользователю.",
    amount: "Количество предупреждений (1–20)",
    channelPreset: "Шаблон канала (начните вводить для поиска)",
    rulePreset: "Правило сервера (начните вводить для поиска)",
    reason: "Своя причина (перекрывает шаблоны)",
    screenshot: "Скриншот нарушения (необязательно)",
    messageId: "ID сообщения нарушителя в текущем канале/треде; сообщение будет удалено автоматически",
  },
  unstrike: {
    commandDescription: "Снять или уменьшить наказание: предупреждения и/или лестницу таймаутов.",
    amount: "Снять столько предупреждений (1–20); не используйте вместе со сбросом",
    resetWarningsChoice: "Сбросить все предупреждения",
    resetWarningsLabel: "Сбросить все предупреждения",
    resetLadderChoice: "Сбросить лестницу таймаутов",
    resetLadderLabel: "Сбросить лестницу таймаутов (след. таймаут с 1-й ступени)",
    lowerLadder: "Опустить лестницу на столько ступеней (1–20)",
  },
  ban: {
    commandDescription: "Перманентно заблокировать пользователя на сервере.",
    channelPreset: "Шаблон канала (начните вводить для поиска)",
    rulePreset: "Правило сервера (начните вводить для поиска)",
    reason: "Своя причина (перекрывает шаблоны)",
    screenshot: "Скриншот нарушения (необязательно)",
    messageId: "ID сообщения нарушителя в текущем канале/треде; сообщение будет удалено автоматически",
    deleteMessages: "Удалить сообщения пользователя за период (необязательно)",
  },
  unban: {
    commandDescription: "Снять блокировку с пользователя.",
    user: "Пользователь",
    userId: "ID пользователя (если не получается выбрать из списка); укажите это ИЛИ поле user, не оба",
  },
  modstatus: {
    commandDescription: "Статус модерации: предупреждения и лестница таймаутов.",
    user: "Пользователь",
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

/** Values are seconds as strings (Discord `delete_message_seconds` on ban). */
export const discordBanDeleteMessageChoices: ReadonlyArray<{ name: string; value: string }> = [
  { name: "1 час", value: "3600" },
  { name: "6 часов", value: "21600" },
  { name: "12 часов", value: "43200" },
  { name: "1 день", value: "86400" },
  { name: "3 дня", value: "259200" },
  { name: "1 неделя", value: "604800" },
];

const BAN_DELETE_SECONDS_ALLOWLIST = new Set(
  discordBanDeleteMessageChoices.map((c) => c.value),
);

export function banDeleteSecondsFromChoice(value: string): number | undefined {
  if (!BAN_DELETE_SECONDS_ALLOWLIST.has(value)) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function banDeleteChoiceLabelFromSeconds(seconds: number): string | undefined {
  return discordBanDeleteMessageChoices.find((c) => c.value === String(seconds))?.name;
}

export function discordModerationLogChannelFieldValue(channelId: string, parentChannelId?: string): string {
  if (parentChannelId) {
    return `<#${channelId}> (тред в <#${parentChannelId}>)`;
  }
  return `<#${channelId}>`;
}

export const discordModerationLogFields = {
  user: "Пользователь",
  channel: "Канал",
  minorWarningsChannel: "Предупреждений",
  timeout: "Таймаут",
  timeoutMinutes: (m: number) => `${m} мин`,
  excerpt: "Текст сообщения",
  moderator: "Модератор",
  logChannelViolation: "Нарушение в канале",
  logRuleServer: (point: string) => `Правило сервера (п. ${point})`,
  logAutomodDetector: "Автомод (детектор)",
} as const;

export const discordModerationLogTitles = {
  staffMute: "Ручной /mute",
  staffUnmute: "Ручной /unmute",
  staffStrike: "Ручной /strike",
  staffUnstrike: "Ручной /unstrike",
  staffBan: "Ручной /ban",
  staffUnban: "Ручной /unban",
  majorTimeout: "Серьёзное нарушение",
  minorWarnOnly: "Легкое нарушение",
  minorWarnTimeout: "Легкое нарушение + таймаут",
} as const;

export const discordCommonReplies = {
  guildOnly: "Только на сервере.",
  guildOnlyCommand: "Эта команда доступна только на сервере.",
  noPermission: "У вас недостаточно прав для этой команды.",
  wrongGuild: "Неверный сервер.",
  channelNotText: "Этот канал не подходит для текстовых сообщений.",
  modalStalePost: "Форма устарела или уже использована. Запустите `/post` снова.",
  modalStaleEdit: "Форма устарела или уже использована. Запустите `/edit` снова.",
  modalStaleRolePanel: "Форма устарела или уже использована. Запустите `/rolepanel` снова.",
  modalStaleLinkPanel: "Форма устарела или уже использована. Запустите `/linkpanel` снова.",
  modalWrongInvokerPost: "Отправить форму может только тот, кто вызвал `/post`.",
  modalWrongInvokerEdit: "Отправить форму может только тот, кто вызвал `/edit`.",
  modalWrongInvokerRolePanel: "Отправить форму может только тот, кто вызвал `/rolepanel`.",
  modalWrongInvokerLinkPanel: "Отправить форму может только тот, кто вызвал `/linkpanel`.",
  postModalNeedsContent:
    "Добавьте текст сообщения, прикрепите картинку и/или задайте embed (например `embed_title`, `embed_description`).",
  panelModalNeedsContent:
    "Добавьте текст сообщения, прикрепите картинку и/или задайте embed (например `embed_title`, `embed_description`).",
  channelUnavailable: "Канал больше недоступен.",
  internalError: "Произошла внутренняя ошибка.",
} as const;

export function discordFmtEditDone(guildId: string, channelId: string, messageId: string): string {
  return `Сообщение обновлено: https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

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
  panelUnknown: "Эта кнопка роли не работает. Сообщите о проблеме модераторам.",
  buttonWrongPanel:
    "Эта кнопка не относится к сохранённой панели для этого сообщения. Сообщите о проблеме модераторам.",
  wrongGuild: "Эта панель ролей относится к другому серверу.",
  memberResolveFailed: "Не удалось определить ваш профиль на сервере.",
  roleMissing: "Роль не найдена. Сообщите о проблеме модераторам.",
  botMemberFailed: "Не удалось загрузить профиль бота на сервере.",
  roleRemoved: (label: string) => `Роль снята: ${label}`,
  roleAdded: (label: string) => `Роль выдана: ${label}`,
  fallbackRoleLabel: "Роль",
  noManageRoles:
    "У этого бота нет права **Управлять ролями** на сервере. Включите его в **Настройки сервера → Интеграции** (или выдайте роли бота это право).",
  hierarchyTarget:
    "Бот не может менять ваши роли из‑за **порядка ролей**: ваша **самая высокая** роль должна быть **ниже** самой высокой роли бота. Поднимите роль бота выше в **Настройки сервера → Роли**.",
  roleManaged: (name: string) =>
    `Роль **${name}** **управляется** Discord (интеграция, подписка и т.п.) — бот не может её выдавать или снимать.`,
  roleNotEditable: (name: string) =>
    `Роль бота должна быть **выше** роли **${name}** в **Настройки сервера → Роли** (перетащите роль бота выше), чтобы бот мог выдавать или снимать эту роль.`,
  apiGeneric: "Не удалось изменить роль. Сообщите о проблеме модераторам.",
  apiRateLimit: "Discord ограничил частоту действий. Подождите немного и попробуйте снова.",
  apiForbidden: "Discord отклонил действие (нет доступа / прав). Сообщите о проблеме модераторам.",
} as const;

export const discordModerationCommands = {
  unknownError: "Неизвестная ошибка",
  defaultMuteReason: "Ручной таймаут модератором",
  unmuteReason: "Таймаут снят модератором",
  strikeDefaultReason: "Наказание выдано модератором",
  unmuteLogReason: "Таймаут снят модератором",
  unstrikeReasonIncrement: (n: number) => `−${n} предупр.`,
  unstrikeReasonClear: "Сброс предупреждений",
  unstrikeReasonLadderLower: (n: number) => `лестница −${n}`,
  unstrikeReasonLadderClear: "Cброс лестницы",
  unstrikeResetWarningsWithAmount: "Не указывайте amount вместе со сбросом предупреждений — выберите одно.",
  unstrikeResetLadderWithLower: "Не указывайте lower_ladder вместе со сбросом лестницы — выберите одно.",
  unstrikeDoneWarnings: (userId: string, before: number, after: number, threshold: number) =>
    `Предупреждения <@${userId}>: **${before}** → **${after}** (порог ${threshold}).`,
  unstrikeDoneLadder: (userId: string, before: number, after: number, ladderSteps: number) =>
    `Лестница <@${userId}>: ступень **${before}** → **${after}** (всего ${ladderSteps} ступеней).`,
  defaultBanReason: "Блокировка модератором",
  banFail: (err: string) => `Не удалось заблокировать: ${err}`,
  banDone: (userId: string, deleteNote: string, evidenceNote: string, shotNote: string) =>
    `Пользователь <@${userId}> заблокирован на сервере.${deleteNote}${evidenceNote}${shotNote}`,
  banDeleteDoneNote: (periodLabel: string) =>
    ` Сообщения пользователя за последние ${periodLabel} удаляются по всему серверу.`,
  banDeleteLogSuffix: (periodLabel: string) => `\n\n**Удаление сообщений:** ${periodLabel}`,
  banBadDeletePeriod: "Некорректный период удаления сообщений.",
  banSelf: "Нельзя заблокировать себя.",
  banOwner: "Нельзя заблокировать владельца сервера.",
  banNotBannable: "Не могу заблокировать этого пользователя (роль выше или недостаточно прав).",
  unbanFail: (err: string) => `Не удалось снять блокировку: ${err}`,
  unbanDone: (userId: string) => `Блокировка снята с <@${userId}>.`,
  unbanNotBanned: "Этот пользователь не в списке банов сервера.",
  unbanNeedExactlyOneTarget: "Укажите либо пользователя (user), либо ID (user_id), одно из двух.",
  unbanBothTargets: "Укажите только поле user или только user_id, не оба сразу.",
  unbanUserUnknown: "Не удалось найти пользователя по этому ID.",
  unbanLogReason: "Блокировка снята модератором",
  guildOnly: "Только на сервере.",
  scopeNeedTextChannel: "Укажите текстовый канал.",
  scopeChannelUnknown: "Не удалось определить канал.",
  muteBot: "Нельзя замутить бота.",
  badDuration: "Некорректная длительность таймаута.",
  userNotInGuild: "Пользователь не на сервере.",
  muteNotModeratable: "Не могу выдать таймаут этому пользователю (роль выше).",
  muteTimeoutFail: (err: string) => `Не удалось выдать таймаут: ${err}`,
  unmuteBadTarget: "Некорректная цель.",
  unmuteNotModeratable: "Не могу снять таймаут (роль выше).",
  unmuteFail: (err: string) => `Не удалось снять таймаут: ${err}`,
  unmuteDone: (userId: string) => `Таймаут снят с <@${userId}>.`,
  strikeCounts: (userId: string, before: number, after: number, threshold: number) =>
    `Предупреждения <@${userId}>: **${before}** → **${after}** / ${threshold}.`,
  strikeTimeoutNote: (durationLabel: string) => `\nТаймаут по лестнице: **${durationLabel}**.`,
  strikeDoneLine: (base: string, timeoutNote: string, shotNote: string, evidenceNote: string) =>
    `${base}${timeoutNote}${shotNote}${evidenceNote}`,
  strikeThresholdTimeoutReason: (staffReason: string, threshold: number) =>
    `Достигнут порог предупреждений (${threshold}): ${staffReason}`.slice(0, 500),
  evidenceInvalidSnowflakeReply: "Некорректный ID сообщения.",
  evidenceCopiedNote: "\nВ отчёт модерации добавлена копия указанного сообщения.",
  evidenceNoteWrongAuthor: "\nУказанное сообщение не от этого пользователя — фрагмент не добавлен.",
  evidenceNoteFetchFail: "\nСообщение не найдено или недоступно.",
  evidenceNoteBadChannel: "\nНельзя прочитать сообщения в этом канале.",
  evidenceNoteInvalidId: "\nНекорректный ID сообщения.",
  evidenceNoLogEnv: "\nКопия сообщения не попадёт в отчёт: не задан канал для модерации.",
  evidenceSourceDeletedNote: "\nСообщение успешно удалено.",
  evidenceSourceDeleteFailNote: "\nНе удалось удалить сообщение.",
  screenshotLogged: "\nСкриншот добавлен в отчет модерации.",
  screenshotNoLogEnv: "\nСкриншот не попадёт в отчет: не задан канал.",
  muteSnapshotEmpty: "(нет текста; есть только вложения/embed/стикеры)",
  muteDone: (durLabel: string, userId: string, evidenceNote: string, shotNote: string) =>
    `Таймаут **${durLabel}** (<@${userId}>).${evidenceNote}${shotNote}`,
  minutesFallback: (n: number) => `${n} мин`,
  screenshotFileFallback: "Скриншот",
  modstatusBot: "Для ботов статус не показывается.",
  modstatusIntro: (userId: string) => `**Статус модерации** — <@${userId}>`,
  modstatusDiscordTimeoutActive: (endUnixSec: number) =>
    `**Таймаут Discord**: **есть** — снимется <t:${endUnixSec}:F> · <t:${endUnixSec}:R>`,
  modstatusDiscordTimeoutInactive: "**Таймаут Discord**: **нет**.",
  modstatusDiscordTimeoutUnknown: "**Таймаут Discord:** не удалось проверить.",
  modstatusLadder: (tier: number, nextDur: string, ladderSteps: number, threshold: number) =>
    `**Лестница таймаутов** (после **${threshold}** предупреждений): следующий шаг **${tier + 1}** / ${ladderSteps}, длительность **${nextDur}**.`,
  modstatusGlobalWarns: (count: number, threshold: number) =>
    `**Предупреждения:** **${count}** / ${threshold}.`,
  modstatusDecayNone: "**Последнее нарушение:** нет записи — отсчёт до авто-сброса не ведётся.",
  modstatusDecayLine: (agoLabel: string, resetInLabel: string) =>
    `**Последнее нарушение:** ${agoLabel} назад. ${resetInLabel}`,
  modstatusDecayPending: (dur: string) =>
    `Без новых нарушений сброс предупреждений и лестниц примерно через **${dur}**.`,
  moderatorQuotaExceeded: (used: number, limit: number) =>
    `Дневной лимит модерации: **${used}/${limit}** (/mute, /strike, /ban). Обновится в 00:00 UTC.`,
  modstatusDailyQuota: (used: number, limit: number, remaining: number) =>
    `**Ваш лимит сегодня (UTC):** **${used}/${limit}** (/mute, /strike, /ban), осталось **${remaining}**.`,
  modstatusDecayDue: "Порог бездействия для сброса уже пройден — сброс произойдёт при следующей проверке нарушения.",
  staffDmLabelReason: "Причина",
  staffDmLabelChannelViolation: "Нарушение в канале",
  staffDmLabelRuleServer: (point: string) => `Правило сервера (п. ${point})`,
  staffDmFooter: "Сообщение от модераторов сервера",
  staffDmTitleMute: "Таймаут",
  staffDmTitleStrikeWarn: "Предупреждение",
  staffDmTitleStrikePunishment: "Наказание",
  staffDmTitleUnmute: "Таймаут снят",
  staffDmUnmuteBody: "Модератор снял с вас таймаут на этом сервере.",
  staffDmTitleBan: "Блокировка на сервере",
  staffDmBanPermanentLine: "Блокировка постоянная.",
  staffDmTitleUnbanFromServer: "Блокировка снята",
  staffDmUnbanFromServerBody: "Модератор снял с вас блокировку на этом сервере.",
} as const;

/** One-line staff digest (see `DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID`); `url` points to the full row in the main mod log. */
export const discordStaffModerationSummary = {
  lineMute: (staffUserId: string, url: string) => `<@${staffUserId}> выдал **Таймаут** — ${url}`,
  lineUnmute: (staffUserId: string, url: string) => `<@${staffUserId}> снял **Таймаут** — ${url}`,
  lineStrike: (staffUserId: string, url: string) => `<@${staffUserId}> выдал **Наказание** — ${url}`,
  lineUnstrike: (staffUserId: string, url: string) => `<@${staffUserId}> уменьшил **Наказание** — ${url}`,
  lineBan: (staffUserId: string, url: string) => `<@${staffUserId}> выдал **Бан** — ${url}`,
  lineUnban: (staffUserId: string, url: string) => `<@${staffUserId}> снял **Бан** — ${url}`,
  lineRoleCreate: (staffUserId: string, roleName: string) =>
    `<@${staffUserId}> создал роль **${roleName.replace(/\*\*/g, "")}**`,
  lineRoleAssign: (staffUserId: string, targetUserId: string, roleName: string) =>
    `<@${staffUserId}> выдал роль **${roleName.replace(/\*\*/g, "")}** — <@${targetUserId}>`,
  lineRoleAssignBatch: (staffUserId: string, roleName: string, firstTargetUserId: string, extraCount: number) =>
    `<@${staffUserId}> выдал роль **${roleName.replace(/\*\*/g, "")}** — <@${firstTargetUserId}> (+${extraCount})`,
  lineRoleRemove: (staffUserId: string, targetUserId: string, roleName: string) =>
    `<@${staffUserId}> снял роль **${roleName.replace(/\*\*/g, "")}** — <@${targetUserId}>`,
  lineRoleRemoveBatch: (staffUserId: string, roleName: string, firstTargetUserId: string, extraCount: number) =>
    `<@${staffUserId}> снял роль **${roleName.replace(/\*\*/g, "")}** — <@${firstTargetUserId}> (+${extraCount})`,
  lineCreatorPost: (authorUserId: string, channelId: string, messageUrl: string) =>
    `<@${authorUserId}> опубликовал пост в <#${channelId}> — ${messageUrl}`,
} as const;

/** Self-deleted media/URL messages → `DISCORD_MESSAGE_REVIEW_CHANNEL_ID`. */
export const discordMessageReview = {
  deletedPing: (authorUserId: string) => `<@${authorUserId}> удалил сообщение`,
  deletedHeader: (authorUserId: string, channelId: string, jumpUrl: string) =>
    `**Автор:** <@${authorUserId}>\n**Канал:** <#${channelId}>\n**Ссылка (недействительна):** ${jumpUrl}`,
  deletedContentBlock: (text: string) => `**Текст:**\n${text.slice(0, 1800)}`,
  deletedNoText: "**Текст:** _(пусто)_",
  attachmentLinkOnly: (name: string, url: string) => `**${name}** (слишком большой файл): ${url}`,
  attachmentFetchFail: (name: string, url: string) => `**${name}** (не удалось скачать): ${url}`,
} as const;

export const discordAutoMod = {
  spamDuplicateReason: "Повтор одного и того же сообщения подряд (спам).",
  spamCrossAuthorCooldownReason:
    "Похожее объявление уже публиковалось в этом канале недавно (не чаще одного раза в 6 часов).",
  invitesForbidden: "В этом канале запрещены приглашения Discord.",
  forbiddenDomain: (host: string) => `Ссылка на запрещённый домен: ${host}`,
  videoForbidden: "В этом канале запрещены видеовложения.",
  imageForbidden: "В этом канале запрещены изображения.",
  textForbidden: "В этом канале запрещены текстовые сообщения.",
  keywordHit: (word: string) => `Обнаружено запрещённое слово: «${word}».`,
  timeoutMajor: (reason: string) => `Автомодерация (серьёзное нарушение): ${reason}`,
  timeoutMinor: (reason: string) => `Автомодерация (легкое нарушение): ${reason}`,
  embedFooter: "Автоматическая модерация",
  titleMajor: "Серьёзное нарушение",
  titleMinor: "Предупреждение",
  labelChannel: "Канал",
  labelReason: "Причина",
  labelChannelViolation: "Нарушение в канале",
  labelRuleServer: (point: string) => `Правило сервера (п. ${point})`,
  labelTimeout: "Таймаут",
  timeoutApplyFail: "**Таймаут:** не удалось применить (ошибка Discord API).",
  timeoutNotModeratable:
    "**Таймаут:** не применён — бот не может замутить этого пользователя (проверьте настройки ролей).",
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
