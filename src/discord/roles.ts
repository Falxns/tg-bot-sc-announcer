import { ButtonInteraction, GuildMember, MessageFlags, PermissionFlagsBits, Role } from "discord.js";
import { stripAllCustomDiscordEmojiMarkup } from "./buttonEmoji";
import { getOrRehydrateRolePanel } from "./rolePanelHydrate";
import { discordRoles as roleTxt } from "./userStrings";

const ROLE_BUTTON_PREFIX = "role:";
const ROLE_BUTTON_SINGLE_PREFIX = "roleone:";

function isRoleButtonCustomId(customId: string): boolean {
  return customId.startsWith(ROLE_BUTTON_PREFIX) || customId.startsWith(ROLE_BUTTON_SINGLE_PREFIX);
}

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
    return roleTxt.noManageRoles;
  }
  if (!target.manageable) {
    return roleTxt.hierarchyTarget;
  }
  if (role.managed) {
    return roleTxt.roleManaged(role.name);
  }
  if (!role.editable) {
    return roleTxt.roleNotEditable(role.name);
  }
  return null;
}

function discordApiRoleHint(err: unknown): string {
  if (typeof err !== "object" || err === null) {
    return roleTxt.apiGeneric;
  }
  const o = err as { code?: unknown; status?: unknown };
  if (o.status === 429) {
    return roleTxt.apiRateLimit;
  }
  const code = o.code;
  if (code === 50001 || code === 50013) {
    return roleTxt.apiForbidden;
  }
  return roleTxt.apiGeneric;
}

export async function handleRoleButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  if (!isRoleButtonCustomId(interaction.customId)) return false;
  const guild = interaction.guild;
  const panel = await getOrRehydrateRolePanel(interaction);
  if (!panel) {
    await interaction.reply({
      content: roleTxt.panelUnknown,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const button = panel.buttons.find((x) => x.customId === interaction.customId);
  if (!button) {
    await interaction.reply({
      content: roleTxt.buttonWrongPanel,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (panel.guildId !== guild.id) {
    await interaction.reply({ content: roleTxt.wrongGuild, flags: MessageFlags.Ephemeral });
    return true;
  }
  const member = interaction.member;
  if (!(member instanceof GuildMember)) {
    await interaction.reply({ content: roleTxt.memberResolveFailed, flags: MessageFlags.Ephemeral });
    return true;
  }

  const role = await guild.roles.fetch(button.roleId).catch(() => null);
  if (!role) {
    await interaction.reply({
      content: roleTxt.roleMissing,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    await interaction.reply({
      content: roleTxt.botMemberFailed,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const blocker = roleToggleHumanBlocker(me, member, role);
  if (blocker) {
    await interaction.reply({ content: blocker, flags: MessageFlags.Ephemeral });
    return true;
  }

  const labelForReply = stripAllCustomDiscordEmojiMarkup(button.label) || roleTxt.fallbackRoleLabel;
  const action = member.roles.cache.has(button.roleId) ? "remove" : "add";
  try {
    if (action === "remove") {
      await member.roles.remove(button.roleId);
      await interaction.reply({ content: roleTxt.roleRemoved(labelForReply), flags: MessageFlags.Ephemeral });
    } else {
      if (panel.singleRole) {
        const otherRoleIds = panel.buttons
          .map((b) => b.roleId)
          .filter((roleId) => roleId !== button.roleId && member.roles.cache.has(roleId));
        if (otherRoleIds.length > 0) {
          await member.roles.remove(otherRoleIds);
        }
      }
      await member.roles.add(button.roleId);
      await interaction.reply({ content: roleTxt.roleAdded(labelForReply), flags: MessageFlags.Ephemeral });
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
