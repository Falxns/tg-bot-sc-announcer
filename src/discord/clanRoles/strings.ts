import { EmbedBuilder } from "discord.js";
import {
  DISCORD_CLAN_ACTIVE_MIN_MEMBERS,
  DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_DAYS,
  DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS,
  DISCORD_CLAN_HELP_CHANNEL_ID,
  DISCORD_CLAN_MAX_ROLES_PER_MEMBER,
} from "../../config";

export const clanTxt = {
  notConfigured: "Клановые роли не настроены на этом сервере.",
  requestUnknown: "Запрос не найден или устарел.",
  internalError: "Произошла ошибка. Попробуйте позже.",

  rulesHelpFooter: "Использовать команды только в ветке под этим сообщением",

  pendingCreateThreadTitle: "Заявка на создание клана",
  pendingCreateThreadBody: (clanName: string) =>
    `Клан **${clanName}** отправлен админам на проверку. Результат придёт в канал уведомлений.`,
  pendingLeaderMetaModThreadTitle: "Запрос: роль лидера",
  pendingLeaderMetaModThreadBody: (clanName: string, targetUserId: string) =>
    `Клан **${clanName}** · кандидат <@${targetUserId}> — ожидает одобрения админов.`,

  cmdInvalidFormat: (example: string) => `Неверный формат. Пример: ${example}`,
  cmdClanNotFound: (query: string) => `Клан не найден: **${query}**`,
  cmdClanAmbiguous: "Найдено несколько кланов — уточните полное название.",
  cmdLeaderMultipleClans: "Вы лидер нескольких кланов — укажите название клана.",
  cmdTargetMultipleClans: "У участника несколько клановых ролей — укажите название клана.",
  cmdTargetOnlyLeaderMod: "Указать @участника может только лидер клана или админ.",
  cmdLeaderRemoveLeaderSelfOnly:
    "Снять роль лидера у другого участника может только админ. Лидер снимает только свою — командой `-лидер`.",
  cmdLeaderRemoveClanRoleFromLeader:
    "Снять клановую роль у лидера клана может только админ. Лидер может снять роль у обычного участника или у себя.",
  cmdNoClanRoles: "У вас нет клановых ролей для снятия.",
  cmdModNeedsTarget: "Админ: укажите @участника или название клана.",
  cmdTargetNotInClan: "Участник не состоит в указанном клане.",
  clanRoleCapSelf: (existingClan: string) =>
    DISCORD_CLAN_MAX_ROLES_PER_MEMBER === 1
      ? `У вас уже есть клановая роль **${existingClan}**. Чтобы получить другую — сначала снимите текущую: \`-клан\`.`
      : `У вас уже ${DISCORD_CLAN_MAX_ROLES_PER_MEMBER} клановых роли (максимум ${DISCORD_CLAN_MAX_ROLES_PER_MEMBER}). Сначала снимите одну: \`-клан\`.`,
  clanRoleCapTarget: (existingClan: string) =>
    DISCORD_CLAN_MAX_ROLES_PER_MEMBER === 1
      ? `У участника уже есть клановая роль **${existingClan}**. Сначала снимите её: \`-клан @участник\`.`
      : `У участника уже ${DISCORD_CLAN_MAX_ROLES_PER_MEMBER} клановых ролей (максимум ${DISCORD_CLAN_MAX_ROLES_PER_MEMBER}). Сначала снимите одну.`,
  createMemberClanRoleCap: (userId: string, existingClan: string) =>
    `У <@${userId}> уже есть клановая роль **${existingClan}**. Участник должен сначала снять её (\`-клан\`).`,
  cmdCreateInvalidHeader:
    "Неверный формат. Строки по порядку: `!создать`, название, тир, цвет и список участников.",
  cmdCreateInvalidColor: (label: string, colorOptions: string) =>
    `Неизвестный цвет: **${label}**. Укажите название из списка (${colorOptions}) или hex (#RRGGBB).`,
  cmdCreateSubmitted: "Заявка на клан отправлена админам на проверку.",
  cmdRosterLeaderOnly: "Список состава доступен только лидерам клана.",
  cmdRosterModNeedsClan: "Админ: укажите название клана (`!состав Название`).",
  cmdRosterNotYourClan: (clanName: string) =>
    `Вы не лидер клана **${clanName}** — можно запросить состав только своего клана.`,
  cmdRosterDmSent: "Список участников отправлен в личные сообщения.",
  cmdColorLeaderOnly: "Сменить цвет роли могут только лидеры клана.",
  cmdColorModNeedsClan: "Админ: укажите клан и цвет (`!цвет Название Красный`).",
  cmdColorNotYourClan: (clanName: string) =>
    `Вы не лидер клана **${clanName}** — можно менять цвет только своего клана.`,
  cmdColorInvalidFormat: (colorOptions: string) =>
    `Неверный формат. Пример: \`!цвет Красный\` или \`!цвет #RRGGBB\`. Цвета: ${colorOptions} или hex.`,
  cmdColorCooldown: (remaining: string) =>
    `Сменить цвет клана можно раз в **${DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_DAYS}** дн. Повторите через **${remaining}**.`,
  cmdColorAlreadySet: (label: string) => `У роли уже установлен цвет **${label}**.`,
  cmdColorRoleNotEditable: "Бот не может изменить цвет этой роли (позиция в иерархии).",
  cmdColorDone: (clanName: string, colorLabel: string) =>
    `Цвет роли **${clanName}** изменён на **${colorLabel}**.`,
  rosterDmFailed:
    "Не удалось отправить ЛС. Откройте личные сообщения от участников сервера и повторите команду.",
  rosterDmTitle: (clanName: string) => `Состав клана ${clanName}`,
  rosterDmCount: (members: number, leaders: number) =>
    `Участников с ролью: **${members}** · лидеров: **${leaders}**`,
  rosterDmFooter: "Лидеры отмечены 👑",
  cmdRemoveDoneTarget: (role: string, target: string) => `Роль **${role}** снята с ${target}.`,
  cmdRemoveLeaderDoneTarget: (role: string, target: string) =>
    `Роль лидера снята с ${target} (клан **${role}**).`,
  notifyRemoveClanRoleSelf: (role: string) => `С вашего аккаунта снята роль **${role}**.`,
  notifyRemoveClanRoleTarget: (role: string) => `С вас снята роль **${role}**.`,
  notifyRemoveLeaderSelf: (role: string) => `Вы сняли с себя роль лидера (клан **${role}**).`,
  notifyRemoveLeaderTarget: (role: string) => `С вас снята роль лидера (клан **${role}**).`,
  clanThreadOffTopicReason:
    "В ветке клановых команд разрешены только сообщения вида +клан, -клан, +лидер, -лидер, !состав, !цвет и блок !создать.",

  createNameInvalid: (min: number, max: number) =>
    `Некорректное название. Длина ${min}–${max} символов, без @ и #.`,
  createNameContainsTag: "Проверьте название клана. Тэг не должен указываться",
  createNameDuplicate: "Роль с таким названием уже существует.",
  createTierMissing: "Укажите тир клана отдельной строкой после названия (S, A, B, C или D).",
  createTierInvalid: "Неверный тир клана. Допустимые значения: S, A (А), B (Б), C (Ц, С), D (Д), E (Е).",
  createTierTooLow: "Роли создаются только для кланов тира **D** и выше.",
  createRosterInvalid: (min: number, max: number) =>
    `Нужно **${min}–${max}** уникальных участников на сервере.`,
  createLeadersInvalid: "Укажите **1–2** лидеров среди участников.",

  grantLeaderCap: (n: number) => `У этого клана уже ${n} лидер(ов) — максимум 2.`,
  grantRequestSent: "Запрос отправлен. Ожидайте одобрения лидера клана или админа.",
  grantApprovedReply: (clanName: string, targetUserId: string, requesterUserId: string) =>
    requesterUserId === targetUserId
      ? `Вам выдана роль **${clanName}**.`
      : `Запрос одобрен — роль **${clanName}** выдана.`,
  grantDeniedReply: (clanName: string) => `Запрос отклонён — роль **${clanName}**.`,
  leaderMetaGrantRequestSent:
    "Запрос на роль лидера отправлен. Действующий лидер клана должен подтвердить, затем админы.",
  leaderMetaGrantRequestSentMod: "Запрос на роль лидера отправлен админам.",
  leaderMetaApprovalPostFailed:
    "Не удалось опубликовать запрос на подтверждение. Проверьте, что у бота есть право «Отправка сообщений в ветках» в канале правил.",
  leaderMetaSentToMod: "Лидер клана подтвердил запрос — заявка отправлена админам.",
  leaderMetaClanDeniedReply: (clanName: string) =>
    `Запрос на роль лидера в **${clanName}** отклонён лидером клана.`,
  alreadyClanLeader: "У участника уже есть роль лидера в этом клане.",
  notClanLeader: "Участник не является лидером указанного клана.",
  leaderMetaNotConfigured: "Роль лидера клана не настроена на сервере.",
  leaderMetaNeedsClanFirstSelf: (clanName: string) =>
    `Роль лидера доступна только участникам клана. Сначала запросите роль: \`+клан ${clanName}\`.`,
  leaderMetaNeedsClanFirstTarget: (clanName: string) =>
    `У участника нет роли **${clanName}**. Сначала выдайте роль клана: \`+клан ${clanName} @участник\`.`,
  leaderMetaNeedsClanFirstAny:
    "Роль лидера доступна только участникам клана. Сначала запросите роль командой `+клан Название`.",
  removeNotYourClanRole: "Вы можете снять только свою клановую роль.",
  targetDoesNotHaveClanRole: "Участник больше не состоит в выбранном клане.",

  pendingGrantTitle: "Запрос: выдать роль",
  pendingGrantLeaderPing: (mentions: string) =>
    `Лидеры клана, проверьте запрос: ${mentions}`,
  pendingGrantLeaderNote: "Запрошена также роль «Лидер клана».",
  pendingLeaderMetaTitle: "Запрос: назначить лидера клана",
  pendingLeaderMetaClanPing: (mentions: string) =>
    `Лидер клана, подтвердите назначение второго лидера: ${mentions}`,
  pendingLeaderMetaClanNote:
    "После вашего подтверждения заявка уйдёт админам на финальное одобрение.",
  leaderMetaClanResolvedLine: (approved: boolean, userId: string) =>
    `\n\n**Статус:** ${approved ? clanTxt.approved : clanTxt.denied} — <@${userId}> (лидер клана)`,
  approve: "Одобрить",
  deny: "Отклонить",
  approved: "Запрос одобрен.",
  denied: "Запрос отклонён.",
  requestResolvedLine: (approved: boolean, userId: string, roleLabel: "лидер клана" | "админ") =>
    `\n\n**Статус:** ${approved ? clanTxt.approved : clanTxt.denied} — <@${userId}> (${roleLabel})`,
  resolverRoleLeader: "лидер клана" as const,
  resolverRoleMod: "админ" as const,
  alreadyResolved: "Этот запрос уже обработан.",
  cannotApprove: "У вас нет прав одобрить этот запрос.",
  noManageRoles: "У бота нет права управлять ролями или роль бота слишком низко.",
  roleMissing: "Клановая роль больше не существует.",
  targetMissing: "Участник не найден на сервере.",

  modCreateTitle: "Новая заявка на клан",
  modCreateReminder: "Проверьте состав в игре перед принятием.",
  modLeaderMetaTitle: "Заявка: назначить лидера клана",
  modLeaderMetaReminder: "Убедитесь, что у клана не больше двух лидеров.",
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
      ? `Заявка отклонена админами.\n**Причина:** ${reason.trim()}`
      : "Заявка отклонена админами.",
  leaderMetaDeniedApplicant: () => "Заявка на роль лидера отклонена админами.",
  leaderMetaApprovedApplicant: (clanName: string, targetUserId: string, requesterUserId: string) =>
    requesterUserId === targetUserId
      ? `Вам выдана роль лидера в клане **${clanName}**.`
      : `Запрос одобрен — роль лидера в клане **${clanName}** выдана.`,

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
  auditGrantLeaderMeta: (mod: string, target: string, role: string) =>
    `[Клан] ${mod} одобрил роль лидера **${role}** → ${target}`,
  auditRemoveLeaderMeta: (actor: string, target: string, role: string) =>
    `[Клан] ${actor} снял роль лидера **${role}** у ${target}`,
  auditDenyLeaderMeta: (mod: string, role: string, targetUserId: string) =>
    `[Клан] ${mod} отклонил заявку на лидера **${role}** (<@${targetUserId}>)`,
  auditEnforcementUnderstaffed: (role: string) =>
    `[Клан] Авто-удаление: **${role}** — меньше минимального состава ${DISCORD_CLAN_ACTIVE_MIN_MEMBERS} после ${DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS} дн.`,
  auditEnforcementLeaderless: (role: string) =>
    `[Клан] Авто-удаление: **${role}** — нет лидеров ${DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS} дн.`,
  auditColorChangeLeader: (actor: string, role: string, color: string) =>
    `[Клан] ${actor} сменил цвет **${role}** → ${color}`,
  auditColorChangeMod: (actor: string, role: string, color: string) =>
    `[Клан] ${actor} (админ) сменил цвет **${role}** → ${color}`,

  enforcementUnderstaffedDm: (
    clanName: string,
    memberCount: number,
    minMembers: number,
    graceDays: number,
    deadlineMs: number,
  ) => {
    const deadline = new Date(deadlineMs).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return (
      `⚠️ Клан **${clanName}**: с ролью меньше **${minMembers}** участников (сейчас **${memberCount}**).\n\n` +
      `Добавьте участников через \`+клан\` в ветке правил кланов.\n\n` +
      `Если через **${graceDays}** дн. состав не восстановится (до **${deadline}**), ` +
      `бот снимет роль лидера и удалит клановую роль.`
    );
  },

  rulesHelpPosted: (url: string) => `Справка по командам опубликована: ${url}`,
} as const;

export function buildClanRulesHelpContent(): string {
  const header = "**Клановые роли:**";
  if (!DISCORD_CLAN_HELP_CHANNEL_ID) return header;
  return `${header}\nПодробнее о командах и настройке клановых ролей читайте в <#${DISCORD_CLAN_HELP_CHANNEL_ID}>`;
}

export function buildClanRulesHelpEmbeds(): EmbedBuilder[] {
  const description =
    "### Участник\n" +
    "`+клан Название` — запросить клановую роль\n" +
    "`-клан` — снять клановую роль\n" +
    "```\n" +
    "!создать\n" +
    "Название Клана (без тэга)\n" +
    "S/A/B/C/D/E (тир клана на момент запроса)\n" +
    "Красный (желаемый цвет роли)\n" +
    "👑 @лидер\n" +
    "@участник\n" +
    "...\n" +
    "```\n" +
    "**Без указания лидеров с использованием 👑, лидером станет первый участник из списка**\n" +
    "### Лидер\n" +
    "`+клан @участник` — выдать роль своего клана участнику\n" +
    "`-клан @участник` — снять клановую роль\n" +
    "`+лидер` — запросить роль лидера в своём клане\n" +
    "`+лидер @участник` — запросить роль лидера для участника\n" +
    "`-лидер` — снять с себя роль лидера\n" +
    "`!состав` — получить список участников с клановой ролью\n" +
    "`!цвет Красный/#RRGGBB` — сменить цвет роли своего клана";

  const main = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(description.slice(0, 4096))
    .setFooter({ text: clanTxt.rulesHelpFooter });

  return [main];
}
