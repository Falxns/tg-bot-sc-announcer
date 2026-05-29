export const clanTxt = {
  notConfigured: "Клановые роли не настроены на этом сервере.",
  requestUnknown: "Запрос не найден или устарел.",
  internalError: "Произошла ошибка. Попробуйте позже.",

  rulesHelp:
    "Клановые команды (в этой ветке):\n\n" +
    "+клан Название              — запросить роль себе\n" +
    "+клан @участник             — выдать роль (лидер одного клана)\n" +
    "+клан Название @участник    — выдать роль (лидер/мод)\n\n" +
    "-клан                       — снять свою роль (если один клан)\n" +
    "-клан @участник             — снять роль (лидер одного клана / мод)\n" +
    "-клан Название @участник    — снять роль (явно)\n\n" +
    "!создать\n" +
    "НазваниеКлана\n" +
    "Красный\n" +
    "👑 @лидер\n" +
    "@участники…\n\n" +
    "На запрос выдачи роли лидер или модератор нажимает **Одобрить** или **Отклонить**.",
  rulesHelpPosted: (url: string) => `Справка по командам опубликована: ${url}`,

  cmdInvalidFormat: (example: string) => `Неверный формат. Пример: ${example}`,
  cmdClanNotFound: (query: string) => `Клан не найден: **${query}**`,
  cmdClanAmbiguous: "Найдено несколько кланов — уточните полное название.",
  cmdLeaderMultipleClans: "Вы лидер нескольких кланов — укажите название клана.",
  cmdTargetMultipleClans: "У участника несколько клановых ролей — укажите название клана.",
  cmdTargetOnlyLeaderMod: "Указать @участника может только лидер клана или модератор.",
  cmdNoClanRoles: "У вас нет клановых ролей для снятия.",
  cmdModNeedsTarget: "Модератор: укажите @участника или название клана.",
  cmdTargetNotInClan: "Участник не состоит в указанном клане.",
  cmdCreateInvalidHeader: "Неверный формат. Первая строка: `!создать`",
  cmdCreateInvalidColor: (label: string) => `Неизвестный цвет: **${label}**. Укажите название из списка пресетов.`,
  cmdCreateSubmitted: "Заявка на клан отправлена модераторам. D-ранг проверяется вручную.",
  cmdRemoveDoneTarget: (role: string, target: string) => `Роль **${role}** снята с ${target}.`,
  clanThreadOffTopicReason:
    "В ветке клановых команд разрешены только сообщения вида +клан, -клан и блок !создать.",

  createNameInvalid: (min: number, max: number) =>
    `Некорректное название. Длина ${min}–${max} символов, без @ и #.`,
  createNameDuplicate: "Роль с таким названием уже существует.",
  createRosterInvalid: (min: number, max: number) =>
    `Нужно **${min}–${max}** уникальных участников на сервере.`,
  createLeadersInvalid: "Укажите **1–2** лидеров среди участников.",

  grantLeaderCap: (n: number) => `У этого клана уже ${n} лидер(ов) — максимум 2.`,
  grantRequestSent: "Запрос отправлен. Ожидайте одобрения лидера клана или модератора.",
  removeNotYourClanRole: "Вы можете снять только свою клановую роль.",
  targetDoesNotHaveClanRole: "Участник больше не состоит в выбранном клане.",

  pendingGrantTitle: "Запрос: выдать роль",
  pendingGrantLeaderPing: (mentions: string) =>
    `Лидеры клана, проверьте запрос: ${mentions}`,
  pendingGrantLeaderNote: "Запрошена также роль «Лидер клана».",
  approve: "Одобрить",
  deny: "Отклонить",
  approved: "Запрос одобрен.",
  denied: "Запрос отклонён.",
  requestResolvedLine: (approved: boolean, userId: string, roleLabel: "лидер клана" | "модератор") =>
    `\n\n**Статус:** ${approved ? clanTxt.approved : clanTxt.denied} — <@${userId}> (${roleLabel})`,
  resolverRoleLeader: "лидер клана" as const,
  resolverRoleMod: "модератор" as const,
  alreadyResolved: "Этот запрос уже обработан.",
  cannotApprove: "У вас нет прав одобрить этот запрос.",
  noManageRoles: "У бота нет права управлять ролями или роль бота слишком низко.",
  roleMissing: "Клановая роль больше не существует.",
  targetMissing: "Участник не найден на сервере.",

  modCreateTitle: "Новая заявка на клан",
  modCreateReminder: "Проверьте D-ранг и состав в игре перед принятием.",
  modAccept: "Принять",
  modDeny: "Отклонить",
  modAccepted: "Заявка принята — роль создана и выдана.",
  modDenied: "Заявка отклонена.",
  modDenyModalTitle: "Отклонить заявку",
  modDenyReasonLabel: "Причина (необязательно)",
  modAlreadyResolved: "Заявка уже обработана.",
  modReviewChannelMissing: "Не настроен канал модерации заявок (DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID).",

  createSuccess: (roleName: string) => `Роль **${roleName}** создана, участникам выданы роли.`,
  createDeniedApplicant: (reason?: string) =>
    reason?.trim()
      ? `Заявка отклонена модераторами.\n**Причина:** ${reason.trim()}`
      : "Заявка отклонена модераторами.",

  clanslistTitle: "Клановые роли",
  clanslistEmpty: "Клановые роли не найдены.",
  clanslistLine: (name: string, leaders: number, members: number) =>
    `**${name}** — лидеров: ${leaders}, участников с ролью: ${members}`,

  auditGrant: (mod: string, target: string, role: string) =>
    `[Клан] ${mod} одобрил выдачу **${role}** → ${target}`,
  auditRemoveDirect: (actor: string, target: string, role: string) =>
    `[Клан] ${actor} снял роль **${role}** у ${target}`,
  auditCreate: (mod: string, role: string, n: number) =>
    `[Клан] ${mod} принял заявку — создана роль **${role}**, выдано ${n} участникам.`,
  auditDenyCreate: (mod: string, role: string) => `[Клан] ${mod} отклонил заявку на **${role}**.`,
} as const;
