import { EmbedBuilder } from "discord.js";
import {
  DISCORD_CLAN_ACTIVE_MIN_MEMBERS,
  DISCORD_CLAN_CHAT_CHANNEL_ID,
  DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_DAYS,
  DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS,
  DISCORD_CLAN_HELP_CHANNEL_ID,
  DISCORD_CLAN_MAX_ROLES_PER_MEMBER,
  DISCORD_CLAN_RECRUIT_CHANNEL_ID,
} from "../../config";

export const clanTxt = {
  notConfigured: "Клановые роли не настроены на этом сервере.",
  requestUnknown: "Запрос не найден или устарел.",

  rulesHelpFooter: "Использовать команды можно только в ветке под этим сообщением",

  pendingCreateThreadTitle: "Запрос: создание клановой роли",
  pendingCreateThreadBody: (clanName: string) =>
    `Клан **${clanName}** отправлен администраторам на проверку. По принятому решению вы будете уведомлены.`,
  pendingLeaderMetaModThreadTitle: "Запрос: роль лидера",
  pendingLeaderMetaModThreadBody: (clanName: string, targetUserId: string) =>
    `Клан **${clanName}** · кандидат <@${targetUserId}> — запрос ожидает одобрения администраторов.`,

  cmdInvalidFormat: (example: string) => `Неверный формат. Пример: ${example}`,
  cmdOneCommandPerMessage: "В одном сообщении — только **одна** команда. Отправьте каждую команду отдельным сообщением.",
  cmdClanNotFound: (query: string) => `Клан не найден: **${query}**`,
  cmdClanAmbiguous: "Найдено несколько кланов — уточните полное название.",
  cmdLeaderMultipleClans: "Вы лидер нескольких кланов — укажите название клана.",
  cmdStaffMultipleClans: "Вы лидер или рекрутер нескольких кланов — укажите название клана.",
  cmdTargetMultipleClans: "У участника несколько клановых ролей — укажите название клана.",
  cmdTargetOnlyStaffMod: "Указать @участника может только лидер, рекрутер или администратор.",
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
  cmdRosterStaffOnly: "Список состава доступен только лидерам и рекрутерам клана.",
  cmdRosterModNeedsClan: "Администратор: укажите название клана (`!состав Название`).",
  cmdRosterNotYourClan: (clanName: string) =>
    `Вы не лидер и не рекрутер клана **${clanName}** — можно запросить состав только своего клана.`,
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
  rosterDmCount: (members: number, leaders: number, recruiters: number) =>
    `Участников с клановой ролью: **${members}** · лидеров: **${leaders}** · рекрутеров: **${recruiters}**`,
  rosterDmFooter: "Лидеры отмечены 👑, рекрутеры — ⭐",
  notifyRemoveClanRoleSelf: (role: string) => `С вас снята клановая роль **${role}**.`,
  notifyRemoveClanRoleTarget: (role: string) => `С вас снята клановая роль **${role}**.`,
  notifyRemoveLeaderSelf: (role: string) => `Вы сняли с себя роль лидера (клан **${role}**).`,
  notifyRemoveLeaderTarget: (role: string) => `С вас снята роль лидера (клан **${role}**).`,
  notifyRemoveRecruiterSelf: (role: string) => `Вы сняли с себя роль рекрутера (клан **${role}**).`,
  notifyRemoveRecruiterTarget: (role: string) => `С вас снята роль рекрутера (клан **${role}**).`,
  notifyTransferLeader: (role: string, targetUserId: string) =>
    `Лидерство в клане **${role}** передано <@${targetUserId}>.`,
  clanThreadOffTopicReason:
    "В ветке разрешены только команды вида +клан, -клан, +лидер, -лидер, +рекрутер, -рекрутер, !передать лидера, !состав, !цвет и блок !создать.",

  createNameInvalid: (min: number, max: number) =>
    `Некорректное название. Длина ${min}–${max} символов, без @ и #.`,
  createNameContainsTag: "Проверьте название клана. Тэг не должен указываться",
  createNameDuplicate: "Клановая роль с таким названием уже существует.",
  createTierMissing: "Укажите тир клана отдельной строкой после названия (S, A, B, C или D).",
  createTierInvalid: "Неверный тир клана. Допустимые значения: S, A (А), B (Б), C (Ц, С), D (Д), E (Е).",
  createTierTooLow: "Роли создаются только для кланов тира **D** и выше.",
  createRosterInvalid: (min: number, max: number) =>
    `Нужно **${min}–${max}** уникальных участников на сервере.`,
  createLeadersInvalid: "Укажите ровно **1** лидера среди участников (👑) или оставьте без пометки — тогда лидером станет первый в списке.",
  createRecruitersInvalid: "Укажите **0–2** рекрутеров среди участников (⭐).",
  createLeaderRecruiterOverlap: "Один участник не может быть и лидером, и рекрутером.",

  grantLeaderCap: (n: number) => `У этого клана уже ${n} лидер(ов) — максимум ${n}.`,
  clanHasLeaderAlready: "У клана уже есть лидер — назначить второго нельзя.",
  grantRecruiterCap: (n: number) => `У этого клана уже ${n} рекрутер(ов) — максимум ${n}.`,
  grantRosterCap: (max: number) =>
    `В клане не больше **${max}** участников. Сначала снимите лишних или разделите добавление на несколько сообщений.`,
  grantApprovedReply: (clanName: string, targetUserId: string, requesterUserId: string) =>
    requesterUserId === targetUserId
      ? `Вам выдана клановая роль **${clanName}**.`
      : `Запрос одобрен — клановая роль **${clanName}** выдана.`,
  grantDirectToTarget: (clanName: string) => `Вам выдана клановая роль **${clanName}**.`,
  grantDeniedReply: (clanName: string) => `Запрос отклонён — клановая роль **${clanName}**.`,
  leaderMetaApprovalPostFailed:
    "Не удалось опубликовать запрос на подтверждение. Проверьте, что у бота есть право «Отправка сообщений в ветках» в канале правил.",
  leaderMetaSentToMod: (clanName: string) =>
    `Клан **${clanName}** — запрос на получение роли лидера передан администраторам.`,
  alreadyClanRecruiter: "У участника уже есть роль рекрутера в этом клане.",
  notClanRecruiter: "Участник не является рекрутером указанного клана.",
  recruiterMetaNotConfigured:
    "Роль рекрутера клана не настроена — задайте `DISCORD_CLAN_RECRUITER_ROLE_ID` и перезапустите бота.",
  recruiterMetaRoleNotFound:
    "Роль рекрутера не найдена на этом сервере — проверьте `DISCORD_CLAN_RECRUITER_ROLE_ID` и перезапустите бота.",
  leaderCannotBeRecruiter: "Лидер клана не может быть рекрутером.",
  recruiterMetaNeedsClanFirstSelf: (clanName: string) =>
    `Роль рекрутера доступна только участникам клана. Сначала запросите роль командой: \`+клан ${clanName}\`.`,
  recruiterMetaNeedsClanFirstTarget: (clanName: string) =>
    `У участника нет клановой роли **${clanName}**. Сначала выдайте роль командой: \`+клан ${clanName} @участник\`.`,
  recruiterMetaNeedsClanFirstAny:
    "Роль рекрутера доступна только участникам клана. Сначала запросите роль командой `+клан Название`.",
  recruiterMetaGrantedDirect: (clanName: string) => `Вам выдана роль рекрутера в клане **${clanName}**.`,
  recruiterMetaDeniedReply: (clanName: string) =>
    `Запрос на получение роли рекрутера в **${clanName}** отклонён.`,
  recruiterMetaApprovedReply: (clanName: string, targetUserId: string, requesterUserId: string) =>
    requesterUserId === targetUserId
      ? `Вам выдана роль рекрутера в клане **${clanName}**.`
      : `Запрос одобрен — роль рекрутера в клане **${clanName}** выдана.`,
  cmdRecruiterRemoveLeaderOnly:
    "Снять роль рекрутера у другого участника может только лидер клана или администратор.",
  cmdRecruiterMultipleClans: "Вы рекрутер нескольких кланов — укажите название клана.",
  cmdTransferLeaderNeedsMention: "Укажите участника: `!передать лидера @участник`.",
  cmdTransferLeaderSelf: "Нельзя передать лидерство самому себе.",
  cmdTransferLeaderOnly: "Передать лидерство может только текущий лидер клана.",
  alreadyClanLeader: "У участника уже есть роль лидера в этом клане.",
  notClanLeader: "Участник не является лидером указанного клана.",
  leaderMetaNotConfigured: "Роль лидера клана не настроена на сервере.",
  leaderMetaRoleNotFound:
    "Роль лидера не найдена на этом сервере — проверьте `DISCORD_CLAN_LEADER_ROLE_ID` и перезапустите бота.",
  leaderMetaNeedsClanFirstSelf: (clanName: string) =>
    `Роль лидера доступна только участникам клана. Сначала запросите роль командой: \`+клан ${clanName}\`.`,
  leaderMetaNeedsClanFirstTarget: (clanName: string) =>
    `У участника нет клановой роли **${clanName}**. Сначала выдайте роль командой: \`+клан ${clanName} @участник\`.`,
  leaderMetaNeedsClanFirstAny:
    "Роль лидера доступна только участникам клана. Сначала запросите роль командой `+клан Название`.",
  removeNotYourClanRole: "Вы можете снять только свою клановую роль.",
  targetDoesNotHaveClanRole: "Участник больше не состоит в выбранном клане.",

  pendingGrantTitle: "Запрос: выдать клановую роль",
  pendingGrantStaffPing: (mentions: string) =>
    `Лидеры и рекрутеры клана, проверьте запрос: ${mentions}`,
  pendingRecruiterTitle: "Запрос: назначить рекрутера клана",
  pendingRecruiterPing: (mentions: string) =>
    `Лидер клана, подтвердите назначение рекрутера: ${mentions}`,
  pendingRecruiterNote: "Лидер клана может одобрить или отклонить запрос.",
  approve: "Одобрить",
  deny: "Отклонить",
  alreadyResolved: "Этот запрос уже обработан.",
  cannotApprove: "У вас нет прав одобрить этот запрос.",
  noManageRoles: "У бота нет права управлять ролями или роль бота слишком низко.",
  targetMissing: "Участник не найден на сервере.",

  modCreateTitle: "Запрос: создание клановой роли",
  modCreateReminder: "Проверьте тир клана в игре перед принятием.",
  modLeaderMetaTitle: "Запрос: получение роли лидера",
  modLeaderMetaReminder: "Убедитесь, что у клана ещё нет лидера.",
  modAccept: "Принять",
  modDeny: "Отклонить",
  modDenied: "Запрос отклонен.",
  modDenyModalTitle: "Отклонить запрос",
  modDenyReasonLabel: "Причина (необязательно)",
  modAlreadyResolved: "Запрос уже обработан.",
  modReviewApproved: (resolver: string) => `**✅ Принято** — ${resolver}`,
  modReviewDenied: (resolver: string, reason?: string) =>
    reason?.trim()
      ? `**❌ Отклонено** — ${resolver}\n**Причина:** ${reason.trim()}`
      : `**❌ Отклонено** — ${resolver}`,
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
  clanslistLine: (name: string, leaders: number, recruiters: number, members: number) =>
    `**${name}** — 👑 ${leaders}, ⭐ ${recruiters}, участников: ${members}`,

  clancheckLeadersWithoutClanTitle: "Лидеры без клановой роли",
  clancheckRecruitersWithoutClanTitle: "Рекрутеры без клановой роли",
  clancheckMultiClanTitle: "Участники с 2+ клановыми ролями",
  clancheckMultiLeadersTitle: "Кланы с более чем 1 лидером",
  clancheckMultiRecruitersTitle: "Кланы с более чем 2 рекрутерами",
  clancheckLeaderRecruiterOverlapTitle: "Участники с ролью лидера и рекрутера в одном клане",
  clancheckEmpty: "Нарушений не найдено.",
  clancheckMultiClanLine: (member: string, roles: string[]) =>
    `${member} — ${roles.join(", ")}`,
  clancheckMultiLeadersLine: (roleName: string, count: number) => `**${roleName}** — лидеров: ${count}`,
  clancheckMultiRecruitersLine: (roleName: string, count: number) =>
    `**${roleName}** — рекрутеров: ${count}`,
  clancheckLeaderRecruiterLine: (member: string, roleName: string) =>
    `${member} — **${roleName}**`,

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
  auditRemoveRecruiterMeta: (actor: string, target: string, role: string) =>
    `[Клан] ${actor} снял роль рекрутера **${role}** у ${target}`,
  auditGrantRecruiterMeta: (mod: string, target: string, role: string) =>
    `[Клан] ${mod} одобрил роль рекрутера **${role}** → ${target}`,
  auditTransferLeader: (from: string, to: string, role: string) =>
    `[Клан] ${from} передал лидерство **${role}** → ${to}`,
  auditEnforcementUnderstaffed: (role: string) =>
    `[Клан] Авто-удаление: **${role}** — меньше минимального состава ${DISCORD_CLAN_ACTIVE_MIN_MEMBERS} после ${DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS} дн.`,
  auditEnforcementLeaderless: (role: string) =>
    `[Клан] Авто-удаление: **${role}** — нет лидеров ${DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS} дн.`,
  auditThreadCleanup: (threadId: string, before: number, after: number, removed: number) =>
    `[Клан] Очистка ветки <#${threadId}>: снято **${removed}** неактивных участников (было **${before}**, стало **${after}**).`,
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

  enforcementLeaderlessDm: (clanName: string, graceDays: number, deadlineMs: number) => {
    const deadline = new Date(deadlineMs).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return (
      `⚠️ Клан **${clanName}**: нет лидера.\n\n` +
      `Назначьте лидера через \`+лидер\` (одобрят администраторы) или передайте лидерство.\n\n` +
      `Если через **${graceDays}** дн. лидер не появится (до **${deadline}**), ` +
      `бот удалит клановую роль.`
    );
  },

  rulesHelpPosted: (url: string) => `Справка по командам опубликована: ${url}`,
} as const;

export function buildClanRulesHelpContent(): string {
  const lines = ["**Клановые роли:**"];

  const accessChannels: string[] = [];
  if (DISCORD_CLAN_RECRUIT_CHANNEL_ID) {
    accessChannels.push(`<#${DISCORD_CLAN_RECRUIT_CHANNEL_ID}>`);
  }
  if (DISCORD_CLAN_CHAT_CHANNEL_ID) {
    accessChannels.push(`<#${DISCORD_CLAN_CHAT_CHANNEL_ID}>`);
  }
  if (accessChannels.length > 0) {
    const joined =
      accessChannels.length === 2
        ? `${accessChannels[0]} и ${accessChannels[1]}`
        : accessChannels[0];
    lines.push(`Получение клановых ролей для набора участников и общения в каналах ${joined}`);
  }

  if (DISCORD_CLAN_HELP_CHANNEL_ID) {
    lines.push(
      `Подробнее о командах и настройке клановых ролей читайте в <#${DISCORD_CLAN_HELP_CHANNEL_ID}>`,
    );
  }

  return lines.join("\n");
}

export function buildClanRulesHelpEmbeds(): EmbedBuilder[] {
  const description =
    "### Команды участника\n" +
    "`+клан Название` — запросить клановую роль\n" +
    "`-клан` — снять клановую роль\n" +
    "`+лидер` — запросить роль лидера (если у клана нет лидера)\n" +
    "`+рекрутер` — запросить роль рекрутера\n" +
    "```\n" +
    "!создать\n" +
    "Название Клана (без тэга)\n" +
    "S/A/B/C/D/E (тир клана на момент запроса)\n" +
    "Красный (желаемый цвет роли)\n" +
    "👑 @лидер\n" +
    "⭐ @рекрутер (необязательно, до 2)\n" +
    "@участник\n" +
    "...\n" +
    "```\n" +
    "**Без 👑 лидером станет первый участник из списка; рекрутеры только с пометкой ⭐**\n" +
    "### Команды лидера\n" +
    "`+клан @участник` — выдать роль клана участнику\n" +
    "`-клан @участник` — снять клановую роль\n" +
    "`+рекрутер @участник` — назначить рекрутера\n" +
    "`-рекрутер @участник` — снять роль рекрутера\n" +
    "`!передать лидера @участник` — передать лидерство\n" +
    "`-лидер` — снять с себя роль лидера\n" +
    "`!состав` — получить список участников с клановой ролью\n" +
    "`!цвет Красный/#RRGGBB` — сменить цвет роли своего клана\n" +
    "### Команды рекрутера\n" +
    "`+клан @участник` — выдать роль клана участнику\n" +
    "`-клан @участник` — снять клановую роль\n" +
    "`!состав` — получить список участников с клановой ролью\n" +
    "`-рекрутер` — снять с себя роль рекрутера";

  const main = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(description.slice(0, 4096))
    .setFooter({ text: clanTxt.rulesHelpFooter });

  return [main];
}
