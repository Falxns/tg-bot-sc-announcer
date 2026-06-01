import { EmbedBuilder } from "discord.js";
import {
  DISCORD_CLAN_ACTIVE_MIN_MEMBERS,
  DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_DAYS,
  DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS,
  DISCORD_CLAN_MAX_ROLES_PER_MEMBER,
  DISCORD_CLAN_ROSTER_MAX,
  DISCORD_CLAN_ROSTER_MIN,
} from "../../config";
import { CLAN_NAME_MAX_LEN, CLAN_NAME_MIN_LEN } from "./constants";
import { formatClanColorPresetOptions } from "./colorPresets";

export const clanTxt = {
  notConfigured: "Клановые роли не настроены на этом сервере.",
  requestUnknown: "Запрос не найден или устарел.",
  internalError: "Произошла ошибка. Попробуйте позже.",

  rulesHelpTitle: "Клановые команды",
  rulesHelpDescription: "Пишите только в ветке под этим сообщением. Неверные команды удаляются.",
  rulesHelpFooter: "Одобрение: кнопки на сообщении бота · ответ приходит на вашу команду",

  cmdInvalidFormat: (example: string) => `Неверный формат. Пример: ${example}`,
  cmdClanNotFound: (query: string) => `Клан не найден: **${query}**`,
  cmdClanAmbiguous: "Найдено несколько кланов — уточните полное название.",
  cmdLeaderMultipleClans: "Вы лидер нескольких кланов — укажите название клана.",
  cmdTargetMultipleClans: "У участника несколько клановых ролей — укажите название клана.",
  cmdTargetOnlyLeaderMod: "Указать @участника может только лидер клана или админ.",
  cmdLeaderRemoveLeaderSelfOnly:
    "Снять роль лидера у другого участника может только админ. Лидер снимает только свою — командой `-лидер`.",
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
  cmdCreateInvalidHeader: "Неверный формат. Первая строка: `!создать`",
  cmdCreateInvalidColor: (label: string, colorOptions: string) =>
    `Неизвестный цвет: **${label}**. Укажите название из списка (${colorOptions}) или hex (#RRGGBB).`,
  cmdCreateSubmitted: "Заявка на клан отправлена админам. D-ранг проверяется вручную.",
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
    `Неверный формат. Пример: \`!цвет Красный\` или \`!цвет Название #RRGGBB\`. Цвета: ${colorOptions} или hex.`,
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
  clanThreadOffTopicReason:
    "В ветке клановых команд разрешены только сообщения вида +клан, -клан, +лидер, -лидер, !состав, !цвет и блок !создать.",

  createNameInvalid: (min: number, max: number) =>
    `Некорректное название. Длина ${min}–${max} символов, без @ и #.`,
  createNameDuplicate: "Роль с таким названием уже существует.",
  createRosterInvalid: (min: number, max: number) =>
    `Нужно **${min}–${max}** уникальных участников на сервере.`,
  createLeadersInvalid: "Укажите **1–2** лидеров среди участников.",

  grantLeaderCap: (n: number) => `У этого клана уже ${n} лидер(ов) — максимум 2.`,
  grantRequestSent: "Запрос отправлен. Ожидайте одобрения лидера клана или админа.",
  grantApprovedReply: (clanName: string, targetUserId: string, requesterUserId: string) =>
    requesterUserId === targetUserId
      ? `Запрос одобрен — роль **${clanName}** выдана вам.`
      : `Запрос одобрен — роль **${clanName}** выдана <@${targetUserId}>.`,
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
  modCreateReminder: "Проверьте D-ранг и состав в игре перед принятием.",
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
  leaderMetaApprovedApplicant: (clanName: string, targetUserId: string) =>
    `Роль лидера в клане **${clanName}** выдана <@${targetUserId}>.`,

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

function clanRoleCapLimitFragment(): string {
  if (DISCORD_CLAN_MAX_ROLES_PER_MEMBER === 1) {
    return "**1** клановая роль на человека";
  }
  if (DISCORD_CLAN_MAX_ROLES_PER_MEMBER > 1) {
    return `**${DISCORD_CLAN_MAX_ROLES_PER_MEMBER}** клановых ролей на человека`;
  }
  return "без лимита клановых ролей на человека";
}

export function buildClanRulesHelpEmbed(): EmbedBuilder {
  const colorOptions = formatClanColorPresetOptions();

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(clanTxt.rulesHelpTitle)
    .setDescription(clanTxt.rulesHelpDescription)
    .addFields(
      {
        name: "+клан",
        value:
          "`+клан Название` — получить роль для себя\n" +
          "`+клан @участник` — выдать роль своего клана (для лидера)\n" +
          "`+клан Название @участник` — явно указать клан при выдаче\n" +
          "→ одобрение лидером/админом",
      },
      {
        name: "-клан",
        value:
          "`-клан` — снять роль с себя\n" +
          "`-клан @участник` — снять роль с участника своего клана (для лидера)\n" +
          "→ роль снимается сразу",
      },
      {
        name: "+лидер",
        value:
          "Нужна роль клана. **2** лидера на клан.\n" +
          "`+лидер Название` - запросить роль лидера себе\n" +
          "`+лидер @участник` - запросить роль лидера для участника\n" +
          "→ при 1 лидере: одобрение лидера → одобрение админов",
      },
      {
        name: "-лидер",
        value: "`-лидер` — снять роль лидера с себя\n`-лидер @участник` — **только для админа**",
      },
      {
        name: "!создать",
        value: "Блок:\n`!создать` → название клана → цвет роли → `👑 @лидер` → `@участники`",
      },
      {
        name: "!состав",
        value:
          "Список участников с ролью клана в ЛС.\n" +
          "**Лидеры:** `!состав` (один клан) или `!состав Название` — только свой клан\n" +
          "**Админы:** `!состав Название` — любой клан",
      },
      {
        name: "!цвет",
        value:
          "Сменить цвет клановой роли.\n" +
          "**Лидеры:** `!цвет Красный` (один клан) или `!цвет Название Красный` — **1 раз в неделю** на клан\n" +
          "**Админы:** `!цвет Название Красный` — любой клан, без лимита",
      },
      {
        name: "Лимиты",
        value:
          `Имя **${CLAN_NAME_MIN_LEN}–${CLAN_NAME_MAX_LEN}** · состав **${DISCORD_CLAN_ROSTER_MIN}–${DISCORD_CLAN_ROSTER_MAX}** · ${clanRoleCapLimitFragment()} · лидеров **1–2**\n` +
          `Минимум **${DISCORD_CLAN_ACTIVE_MIN_MEMBERS}** участников с ролью · иначе через **${DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS}** дн. роль удаляется`,
      },
      {
        name: "Цвета",
        value: `${colorOptions}\nИли \`#RRGGBB\` (например \`#e74c3c\`). \`Желтый\` = \`Жёлтый\`.`,
      },
    )
    .setFooter({ text: clanTxt.rulesHelpFooter });
}
