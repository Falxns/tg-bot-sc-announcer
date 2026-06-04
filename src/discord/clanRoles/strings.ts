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

  rulesHelpFooter: "Использовать команды только в ветке под этим сообщением",

  pendingCreateThreadTitle: "Запрос: создание клановой роли",
  pendingCreateThreadBody: (clanName: string) =>
    `Клан **${clanName}** отправлен администраторам на проверку. По принятому решению вы будете уведомлены.`,
  pendingLeaderMetaModThreadTitle: "Запрос: роль лидера",
  pendingLeaderMetaModThreadBody: (clanName: string, targetUserId: string) =>
    `Клан **${clanName}** · кандидат <@${targetUserId}> — запрос ожидает одобрения администраторов.`,

  cmdInvalidFormat: (example: string) => `Неверный формат. Пример: ${example}`,
  cmdClanNotFound: (query: string) => `Клан не найден: **${query}**`,
  cmdClanAmbiguous: "Найдено несколько кланов — уточните полное название.",
  cmdLeaderMultipleClans: "Вы лидер нескольких кланов — укажите название клана.",
  cmdTargetMultipleClans: "У участника несколько клановых ролей — укажите название клана.",
  cmdTargetOnlyLeaderMod: "Указать @участника может только лидер клана или администратор.",
  cmdLeaderRemoveLeaderSelfOnly:
    "Снять роль лидера у другого участника может только администратор. Лидер снимает только свою — командой `-лидер`.",
  cmdLeaderRemoveClanRoleFromLeader:
    "Снять клановую роль у лидера клана может только администратор. Лидер может снять роль у обычного участника или у себя.",
  cmdNoClanRoles: "У вас нет клановых ролей для снятия.",
  cmdModNeedsTarget: "Администратор: укажите @участника или название клана.",
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
  cmdRosterLeaderOnly: "Список состава доступен только лидерам клана.",
  cmdRosterModNeedsClan: "Администратор: укажите название клана (`!состав Название`).",
  cmdRosterNotYourClan: (clanName: string) =>
    `Вы не лидер клана **${clanName}** — можно запросить состав только своего клана.`,
  cmdRosterDmSent: "Список участников отправлен в личные сообщения.",
  cmdColorLeaderOnly: "Сменить цвет роли могут только лидеры клана.",
  cmdColorModNeedsClan: "Администратор: укажите клан и цвет (`!цвет Название Красный`).",
  cmdColorNotYourClan: (clanName: string) =>
    `Вы не лидер клана **${clanName}** — можно менять цвет только своего клана.`,
  cmdColorInvalidFormat: (colorOptions: string) =>
    `Неверный формат. Пример: \`!цвет Красный\` или \`!цвет #RRGGBB\`. Доступные цвета: ${colorOptions}.`,
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
    `Участников с клановой ролью: **${members}** · лидеров: **${leaders}**`,
  rosterDmFooter: "Лидеры отмечены 👑",
  notifyRemoveClanRoleSelf: (role: string) => `С вас снята клановая роль **${role}**.`,
  notifyRemoveClanRoleTarget: (role: string) => `С вас снята клановая роль **${role}**.`,
  notifyRemoveLeaderSelf: (role: string) => `Вы сняли с себя роль лидера (клан **${role}**).`,
  notifyRemoveLeaderTarget: (role: string) => `С вас снята роль лидера (клан **${role}**).`,
  clanThreadOffTopicReason:
    "В ветке разрешены только команды вида +клан, -клан, +лидер, -лидер, !состав, !цвет и блок !создать.",

  createNameInvalid: (min: number, max: number) =>
    `Некорректное название. Длина ${min}–${max} символов, без @ и #.`,
  createNameContainsTag: "Проверьте название клана. Тэг не должен указываться",
  createNameDuplicate: "Клановая роль с таким названием уже существует.",
  createTierMissing: "Укажите тир клана отдельной строкой после названия (S, A, B, C или D).",
  createTierInvalid: "Неверный тир клана. Допустимые значения: S, A (А), B (Б), C (Ц, С), D (Д), E (Е).",
  createTierTooLow: "Роли создаются только для кланов тира **D** и выше.",
  createRosterInvalid: (min: number, max: number) =>
    `Нужно **${min}–${max}** уникальных участников на сервере.`,
  createLeadersInvalid: "Укажите **1–2** лидеров среди участников.",

  grantLeaderCap: (n: number) => `У этого клана уже ${n} лидер(ов) — максимум 2.`,
  grantApprovedReply: (clanName: string, targetUserId: string, requesterUserId: string) =>
    requesterUserId === targetUserId
      ? `Вам выдана клановая роль **${clanName}**.`
      : `Запрос одобрен — клановая роль **${clanName}** выдана.`,
  grantDirectToTarget: (clanName: string) => `Вам выдана клановая роль **${clanName}**.`,
  grantDeniedReply: (clanName: string) => `Запрос отклонён — клановая роль **${clanName}**.`,
  leaderMetaApprovalPostFailed:
    "Не удалось опубликовать запрос на подтверждение. Проверьте, что у бота есть право «Отправка сообщений в ветках» в канале правил.",
  leaderMetaSentToMod: (clanName: string) =>
    `Клан **${clanName}** — лидер клана подтвердил запрос на получение роли лидера. Запрос передан администраторам.`,
  leaderMetaClanDeniedReply: (clanName: string) =>
    `Запрос на получение роли лидера в **${clanName}** отклонён лидером клана.`,
  alreadyClanLeader: "У участника уже есть роль лидера в этом клане.",
  notClanLeader: "Участник не является лидером указанного клана.",
  leaderMetaNotConfigured: "Роль лидера клана не настроена на сервере.",
  leaderMetaNeedsClanFirstSelf: (clanName: string) =>
    `Роль лидера доступна только участникам клана. Сначала запросите роль командой: \`+клан ${clanName}\`.`,
  leaderMetaNeedsClanFirstTarget: (clanName: string) =>
    `У участника нет клановой роли **${clanName}**. Сначала выдайте роль командой: \`+клан ${clanName} @участник\`.`,
  leaderMetaNeedsClanFirstAny:
    "Роль лидера доступна только участникам клана. Сначала запросите роль командой `+клан Название`.",
  removeNotYourClanRole: "Вы можете снять только свою клановую роль.",
  targetDoesNotHaveClanRole: "Участник больше не состоит в выбранном клане.",

  pendingGrantTitle: "Запрос: выдать клановую роль",
  pendingGrantLeaderPing: (mentions: string) =>
    `Лидеры клана, проверьте запрос: ${mentions}`,
  pendingGrantLeaderNote: "Запрошена также роль «Лидер клана».",
  pendingLeaderMetaTitle: "Запрос: назначить лидера клана",
  pendingLeaderMetaClanPing: (mentions: string) =>
    `Лидер клана, подтвердите назначение второго лидера: ${mentions}`,
  pendingLeaderMetaClanNote:
    "После вашего подтверждения запрос будет передан администраторам на финальное одобрение.",
  approve: "Одобрить",
  deny: "Отклонить",
  alreadyResolved: "Этот запрос уже обработан.",
  cannotApprove: "У вас нет прав одобрить этот запрос.",
  noManageRoles: "У бота нет права управлять ролями или роль бота слишком низко.",
  targetMissing: "Участник не найден на сервере.",

  modCreateTitle: "Запрос: создание клановой роли",
  modCreateReminder: "Проверьте тир клана в игре перед принятием.",
  modLeaderMetaTitle: "Запрос: получение роли лидера",
  modLeaderMetaReminder: "Убедитесь, что у клана не больше двух лидеров.",
  modAccept: "Принять",
  modDeny: "Отклонить",
  modDenied: "Запрос отклонен.",
  modDenyModalTitle: "Отклонить запрос",
  modDenyReasonLabel: "Причина (необязательно)",
  modAlreadyResolved: "Запрос уже обработан.",
  modReviewChannelMissing: "Не настроен канал модерации запросов (DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID).",

  createSuccess: (roleName: string) => `Клановая роль **${roleName}** создана, участникам выданы роли.`,
  createDeniedApplicant: (reason?: string) =>
    reason?.trim()
      ? `Запрос на создание клановой роли отклонен администраторами.\n**Причина:** ${reason.trim()}`
      : "Запрос на создание клановой роли отклонен администраторами.",
  leaderMetaDeniedApplicant: () => "Запрос на получение роли лидера отклонен администраторами.",
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
    `[Клан] ${mod} принял запрос — создана роль **${role}**, выдано ${n} участникам.`,
  auditDenyCreate: (mod: string, role: string) => `[Клан] ${mod} отклонил запрос на **${role}**.`,
  auditGrantLeaderMeta: (mod: string, target: string, role: string) =>
    `[Клан] ${mod} одобрил роль лидера **${role}** → ${target}`,
  auditRemoveLeaderMeta: (actor: string, target: string, role: string) =>
    `[Клан] ${actor} снял роль лидера **${role}** у ${target}`,
  auditDenyLeaderMeta: (mod: string, role: string, targetUserId: string) =>
    `[Клан] ${mod} отклонил запрос на лидера **${role}** (<@${targetUserId}>)`,
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
      `Добавьте участников через \`+клан\` в ветке клановых ролей.\n\n` +
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
