import { ButtonInteraction, GuildMember, MessageFlags, PermissionFlagsBits, Role } from "discord.js";
import { stripAllCustomDiscordEmojiMarkup } from "./buttonEmoji";
import { getOrRehydrateRolePanel } from "./rolePanelHydrate";

function buildRoleToggleDiagnostics(me: GuildMember, target: GuildMember, role: Role): Record<string, unknown> {
  const botHigh = me.roles.highest;
  const targetHigh = target.roles.highest;
  return {
    guildId: role.guild.id,
    targetUserId: target.id,
    targetRoleId: role.id,
    manageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
    targetManageable: target.manageable,
    targetRoleManaged: role.managed,
    targetRoleEditable: role.editable,
    botHighestRole: { id: botHigh.id, name: botHigh.name, position: botHigh.position },
    targetMemberHighestRole: { id: targetHigh.id, name: targetHigh.name, position: targetHigh.position },
    assignableRole: { id: role.id, name: role.name, position: role.position },
    botHighest_comparePositionTo_assignableRole: botHigh.comparePositionTo(role),
    targetHighest_comparePositionTo_botHighest: targetHigh.comparePositionTo(botHigh),
  };
}

function roleToggleHumanBlocker(me: GuildMember, target: GuildMember, role: Role): string | null {
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "У этого бота нет права **Управлять ролями** на сервере. Включите его в **Настройки сервера → Интеграции** (или выдайте роли бота это право).";
  }
  if (!target.manageable) {
    return "Бот не может менять ваши роли из‑за **порядка ролей**: ваша **самая высокая** роль должна быть **ниже** самой высокой роли бота. Поднимите роль бота выше в **Настройки сервера → Роли**.";
  }
  if (role.managed) {
    return `Роль **${role.name}** **управляется** Discord (интеграция, подписка и т.п.) — бот не может её выдавать или снимать.`;
  }
  if (!role.editable) {
    return `Роль бота должна быть **выше** роли **${role.name}** в **Настройки сервера → Роли** (перетащите роль бота выше), чтобы бот мог выдавать или снимать эту роль.`;
  }
  return null;
}

function discordApiRoleHint(err: unknown): string {
  if (typeof err !== "object" || err === null) {
    return "Не удалось изменить роль. Обратитесь к администраторам сервера.";
  }
  const o = err as { code?: unknown; status?: unknown };
  if (o.status === 429) {
    return "Discord ограничил частоту действий. Подождите немного и попробуйте снова.";
  }
  const code = o.code;
  if (code === 50001 || code === 50013) {
    return "Discord отклонил действие (**нет доступа / прав**). Обычно помогает: (1) у бота есть **Управлять ролями**, (2) роль бота **выше** роли на кнопке, (3) ваша верхняя роль **ниже** верхней роли бота.";
  }
  return "Не удалось изменить роль. Обратитесь к администраторам сервера.";
}

export async function handleRoleButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  if (!interaction.customId.startsWith("role:")) return false;
  const guild = interaction.guild;
  const panel = await getOrRehydrateRolePanel(interaction);
  if (!panel) {
    await interaction.reply({
      content:
        "Эта кнопка роли не зарегистрирована у бота (состояние потеряли после перезапуска или сообщение не удалось восстановить). Попросите модератора снова выполнить `/rolepanel`.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const button = panel.buttons.find((x) => x.customId === interaction.customId);
  if (!button) {
    await interaction.reply({
      content: "Эта кнопка не относится к сохранённой панели ролей для этого сообщения. Попробуйте снова `/rolepanel`.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (panel.guildId !== guild.id) {
    await interaction.reply({ content: "Эта панель ролей относится к другому серверу.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const member = interaction.member;
  if (!(member instanceof GuildMember)) {
    await interaction.reply({ content: "Не удалось определить ваш профиль участника на этом сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const role = await guild.roles.fetch(button.roleId).catch(() => null);
  if (!role) {
    await interaction.reply({
      content: "Роль не найдена (возможно, удалена). Создайте панель заново через `/rolepanel`.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    await interaction.reply({
      content:
        "Не удалось загрузить профиль бота на сервере. Проверьте, что бот в гильдии и при необходимости включён интент **Участники сервера** (Server Members Intent).",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const blocker = roleToggleHumanBlocker(me, member, role);
  if (blocker) {
    await interaction.reply({ content: blocker, flags: MessageFlags.Ephemeral });
    return true;
  }

  const labelForReply = stripAllCustomDiscordEmojiMarkup(button.label) || "роль";
  const action = member.roles.cache.has(button.roleId) ? "remove" : "add";
  try {
    if (action === "remove") {
      await member.roles.remove(button.roleId);
      await interaction.reply({ content: `Роль снята: ${labelForReply}`, flags: MessageFlags.Ephemeral });
    } else {
      await member.roles.add(button.roleId);
      await interaction.reply({ content: `Роль выдана: ${labelForReply}`, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    const hint = discordApiRoleHint(err);
    const apiMeta =
      typeof err === "object" && err !== null && "code" in err
        ? { code: (err as { code?: unknown }).code, status: (err as { status?: unknown }).status }
        : {};
    const diag = buildRoleToggleDiagnostics(me, member, role);
    console.warn(
      "[Discord role-toggle] API error",
      JSON.stringify({ action, customId: interaction.customId, ...diag, api: apiMeta }, null, 2),
    );
    console.error("Discord role toggle failed:", err);
    await interaction.reply({ content: hint, flags: MessageFlags.Ephemeral });
  }
  return true;
}
