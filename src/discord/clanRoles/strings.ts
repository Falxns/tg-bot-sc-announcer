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
  createNameContainsTag: "Проверьте название клана. Тэг не должен указываться",
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

export function buildClanRulesHelpContent(): string {
  return (
    "# 🛡️ Клановые роли\n\n" +
    "Все команды пишутся **только в ветке под этим сообщением**. Неверные команды автоматически удаляются."
  );
}

export function buildClanRulesHelpEmbeds(): EmbedBuilder[] {
  const colorOptions = formatClanColorPresetOptions();
  const oneClanRoleNote =
    DISCORD_CLAN_MAX_ROLES_PER_MEMBER === 1
      ? "• Участник может иметь только **одну** клановую роль."
      : `• Участник может иметь не более **${DISCORD_CLAN_MAX_ROLES_PER_MEMBER}** клановых ролей.`;
  const colorCooldownNote =
    DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_DAYS === 7
      ? "• Лидеры могут менять цвет не чаще **одного раза в неделю**."
      : `• Лидеры могут менять цвет не чаще **${DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_DAYS}** дн. (на клан).`;

  const main = new EmbedBuilder()
    .setColor(0x5865f2)
    .addFields(
      {
        name: "➕ Получение клановой роли",
        value:
          "Получить свою клановую роль:\n`+клан Название`\n\n" +
          "Выдать клановую роль участнику:\n`+клан @участник`\n\n" +
          "**Как работает**\n" +
          "• Запрос требует одобрения лидера соответствующей клановой роли или администратора.\n" +
          "• После одобрения бот автоматически выдаст роль.\n" +
          oneClanRoleNote,
      },
      {
        name: "➖ Снятие клановой роли",
        value:
          "Снять клановую роль с себя:\n`-клан`\n\n" +
          "Снять клановую роль с участника:\n`-клан @участник`\n\n" +
          "**Как работает**\n" +
          "• Лидер может снять клановую роль участнику своего клана.\n" +
          "• Дополнительное подтверждение не требуется.",
      },
      {
        name: "👑 Лидер",
        value:
          "Роль лидера необходима для использования канала **#набор-в-кланы** и управления клановой ролью.\n\n" +
          "Назначить себя лидером:\n`+лидер`\n\n" +
          "Назначить лидера:\n`+лидер @участник`\n\n" +
          "Снять лидерство:\n`-лидер`\n\n" +
          "**Возможности лидера**\n" +
          "• Выдача и снятие клановых ролей.\n" +
          "• Получение состава клана.\n" +
          "• Смена цвета клановой роли.\n" +
          "• Одобрение запросов от участников.",
      },
      {
        name: "👑 Лидер — ограничения",
        value:
          "• Максимум **2 лидера** на одну клановую роль.\n" +
          "• Если лимит лидеров достигнут, а один из лидеров отказывается самостоятельно снять роль через `-лидер`, обратитесь к любому **администратору**.",
      },
      {
        name: "🏰 Создание клановой роли",
        value:
          "Для регистрации роли отправьте сообщение следующего вида:\n\n" +
          "```\n!создать\nНазвание\nЦвет\n👑 @лидер\n@участник\n@участник\n...\n```\n\n" +
          "**Правила создания**\n" +
          "• Все данные указываются сразу в сообщении строго по порядку.\n" +
          "• Не добавляйте тег клана в строку с названием.\n" +
          "• Максимум **2 лидера** на клан.\n" +
          "• Для назначения лидера используйте корону перед упоминанием: `👑 @участник`\n" +
          "👑 ← корона для копирования",
      },
      {
        name: "🏰 Создание — требования",
        value:
          `• Название клана: от **${CLAN_NAME_MIN_LEN} до ${CLAN_NAME_MAX_LEN}** символов.\n` +
          `• Минимум **${DISCORD_CLAN_ROSTER_MIN} участников** для регистрации.\n` +
          "• **Если корона не указана, лидером автоматически станет первый участник из списка.**",
      },
      {
        name: "📋 Состав клана",
        value:
          "Получить список участников:\n`!состав`\n\n" +
          "**Как работает**\n" +
          "• Команда доступна только лидерам.\n" +
          "• Список участников отправляется в личные сообщения.\n" +
          "• В списке отображаются все участники с данной клановой ролью.",
      },
      {
        name: "🎨 Смена цвета",
        value:
          "Изменить цвет клановой роли:\n`!цвет Красный`\nили\n`!цвет #e74c3c`\n\n" +
          "**Ограничения**\n" +
          `${colorCooldownNote}\n` +
          "• Администраторы могут менять цвет без ограничений.",
      },
      {
        name: "🎨 Поддерживаемые цвета",
        value:
          `${colorOptions}.\n` +
          "Также поддерживается HEX-формат: `#RRGGBB`\n" +
          "Пример: `#e74c3c` (`Желтый` = `Жёлтый`).",
      },
      {
        name: "📌 Ограничения и правила",
        value:
          "**Размер клана**\n" +
          `• Максимум **${DISCORD_CLAN_ROSTER_MAX} участников** с клановой ролью, включая лидеров.\n\n` +
          "**Активность**\n" +
          `• Для существования клановой роли необходимо минимум **${DISCORD_CLAN_ACTIVE_MIN_MEMBERS} участников**.\n` +
          `• Если участников станет меньше ${DISCORD_CLAN_ACTIVE_MIN_MEMBERS}, лидеры получат уведомление в ЛС.\n` +
          `• Если в течение **${DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS} дней** состав не восстановится, клановая роль будет удалена.`,
      },
      {
        name: "📌 Отсутствие лидера",
        value:
          "• У каждой клановой роли должен быть хотя бы один лидер.\n" +
          `• Если все лидеры покинут должность, начнётся отсчёт **${DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS} дней**.\n` +
          "• Если за это время новый лидер не будет назначен, клановая роль будет удалена.",
      },
      {
        name: "ℹ️ Одобрение запросов",
        value:
          "После отправки команды бот создаёт запрос на одобрение.\n\n" +
          "Одобрить запрос может:\n" +
          "• лидер соответствующей клановой роли;\n" +
          "• администратор сервера.\n\n" +
          "После одобрения бот автоматически выполнит действие и сообщит о результате.",
      },
    )
    .setFooter({ text: clanTxt.rulesHelpFooter });

  return [main];
}
