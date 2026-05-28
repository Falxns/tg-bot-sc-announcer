export const clanTxt = {
  notConfigured: "Клановые роли не настроены на этом сервере.",
  panelUnknown: "Панель кланов не найдена или устарела.",
  wrongGuild: "Эта панель принадлежит другому серверу.",
  internalError: "Произошла ошибка. Попробуйте позже.",

  panelGrant: "Получить роль",
  panelRemove: "Снять роль",
  panelCreate: "Создать клан",
  panelIntro:
    "Выберите действие:\n• **Получить роль** — запрос роли существующего клана\n• **Снять роль** — снятие клановой роли\n• **Создать клан** — заявка на новую клановую роль",

  selectClanPlaceholder: "Выберите клан",
  selectClanEmpty: "На сервере нет доступных клановых ролей.",
  selectClanPage: (page: number, total: number) => `Страница ${page + 1} / ${total}`,
  removeSelectClanPlaceholder: "Выберите клановую роль для снятия",
  selectTargetPlaceholder: "Выберите участника",
  selectTargetNoMembers: "В выбранном клане пока нет участников с этой ролью.",
  targetNotTeammate: "Можно выбрать только участника выбранного клана.",

  grantLeaderToggle: "Также выдать «Лидер клана»",
  grantLeaderCap: (n: number) => `У этого клана уже ${n} лидер(ов) — максимум 2.`,
  grantSearchTitle: "Поиск клана",
  grantSearchLabel: "Название клана (полное или часть)",
  grantSearchNoResults: (query: string) =>
    `Не найдено кланов по запросу **${query}**. Попробуйте изменить текст поиска.`,
  grantRequestSent: "Запрос отправлен. Ожидайте одобрения лидера клана или модератора.",
  removeDone: (role: string) => `Роль **${role}** снята.`,
  removeNoOwnClanRole: "У вас нет клановых ролей для снятия.",
  removeNotYourClanRole: "Вы можете снять только свою клановую роль.",
  targetDoesNotHaveClanRole: "Участник больше не состоит в выбранном клане.",

  pendingGrantTitle: "Запрос: выдать роль",
  pendingRemoveTitle: "Запрос: снять роль",
  pendingGrantLeaderNote: "Запрошена также роль «Лидер клана».",
  approve: "Одобрить",
  deny: "Отклонить",
  approved: "Запрос одобрен.",
  denied: "Запрос отклонён.",
  alreadyResolved: "Этот запрос уже обработан.",
  cannotApprove: "У вас нет прав одобрить этот запрос.",
  noManageRoles: "У бота нет права управлять ролями или роль бота слишком низко.",
  roleMissing: "Клановая роль больше не существует.",
  targetMissing: "Участник не найден на сервере.",

  wizardWelcome: (min: number, max: number) =>
    `Заявка на **новую клановую роль**.\n\n` +
    `**Шаг 1.** Ответьте в этой ветке **полным названием клана** (как будет называться роль в Discord).\n\n` +
    `Далее: цвет роли → состав **${min}–${max}** участников (@mention) → проверка → отправка модераторам.`,
  wizardAskName: "Напишите **полное название клана** (как будет называться роль).",
  wizardAskColor: "Выберите **цвет роли**:",
  wizardColorPlaceholder: "Выберите цвет роли",
  wizardAskRoster: (min: number, max: number) =>
    `Отметьте **${min}–${max}** участников \`@mention\`. Лидеры (1–2) **входят** в этот список.\n` +
    `Сделайте это в одном сообщении, удобно копипастой (каждый участник с новой строки):\n` +
    `👑 @Лидер1\n` +
    `@Участник2\n` +
    `@Участник3\n` +
    `Если 👑 не указана, лидером будет считаться первый упомянутый участник.`,
  wizardWrongUser: "Это не ваша заявка.",
  wizardNameInvalid: (min: number, max: number) =>
    `Некорректное название. Длина ${min}–${max} символов, без @ и #.`,
  wizardNameDuplicate: "Роль с таким названием уже существует.",
  wizardRosterInvalid: (min: number, max: number) =>
    `Нужно **${min}–${max}** уникальных участников на сервере.`,
  wizardLeadersInvalid: "Укажите **1–2** лидеров среди участников.",
  wizardReviewTitle: "Проверьте заявку",
  wizardConfirm: "Подтвердить",
  wizardEdit: "Изменить",
  wizardSubmitted:
    "Заявка отправлена модераторам. Ожидайте решения. D-ранг проверяется модераторами вручную.",
  wizardCancelled: "Заявка отменена.",

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
  auditRemove: (mod: string, target: string, role: string) =>
    `[Клан] ${mod} одобрил снятие **${role}** с ${target}`,
  auditRemoveDirect: (actor: string, target: string, role: string) =>
    `[Клан] ${actor} снял роль **${role}** у ${target}`,
  auditCreate: (mod: string, role: string, n: number) =>
    `[Клан] ${mod} принял заявку — создана роль **${role}**, выдано ${n} участникам.`,
  auditDenyCreate: (mod: string, role: string) => `[Клан] ${mod} отклонил заявку на **${role}**.`,
} as const;
