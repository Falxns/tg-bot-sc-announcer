import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { LAST_SEEN_STATE_FILE } from "../config";
import { logModerationEvent } from "./moderationLog";
import { adjustMinorWarningCount, getMinorWarningCount, saveState, setMinorWarningCount } from "../state";

function warningScopeChannelIdFromInteraction(interaction: ChatInputCommandInteraction): string | null {
  const ch = interaction.channel;
  if (!ch?.isTextBased()) return null;
  if ("isThread" in ch && ch.isThread()) {
    return ch.parentId ?? ch.id;
  }
  return ch.id;
}

export const muteSlashCommand = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Выдать таймаут пользователю (без изменения авто-лестниц).")
  .addUserOption((o) => o.setName("user").setDescription("Пользователь").setRequired(true))
  .addIntegerOption((o) =>
    o
      .setName("minutes")
      .setDescription("Длительность в минутах (1–40320, макс. 28 дней)")
      .setMinValue(1)
      .setMaxValue(40320)
      .setRequired(false),
  )
  .addStringOption((o) => o.setName("reason").setDescription("Причина").setMaxLength(450).setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const unmuteSlashCommand = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Снять таймаут с пользователя.")
  .addUserOption((o) => o.setName("user").setDescription("Пользователь").setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const warnSlashCommand = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Добавить минор-предупреждение пользователю в канале.")
  .addUserOption((o) => o.setName("user").setDescription("Пользователь").setRequired(true))
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("Канал учёта (по умолчанию текущий)")
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
      )
      .setRequired(false),
  )
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Сколько добавить (1–20)").setMinValue(1).setMaxValue(20).setRequired(false),
  )
  .addStringOption((o) => o.setName("reason").setDescription("Причина").setMaxLength(450).setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const unwarnSlashCommand = new SlashCommandBuilder()
  .setName("unwarn")
  .setDescription("Уменьшить или сбросить минор-предупреждения пользователя в канале.")
  .addUserOption((o) => o.setName("user").setDescription("Пользователь").setRequired(true))
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("Канал учёта (по умолчанию текущий)")
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
      )
      .setRequired(false),
  )
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("На сколько уменьшить (1–20)").setMinValue(1).setMaxValue(20).setRequired(false),
  )
  .addBooleanOption((o) => o.setName("clear").setDescription("Сбросить счётчик в этом канале").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

async function resolveWarningScope(
  interaction: ChatInputCommandInteraction,
  channelOptId: string | null,
): Promise<{ scopeId: string } | { error: string }> {
  if (!interaction.guildId) return { error: "Только на сервере." };
  if (channelOptId) {
    const fetched = await interaction.guild!.channels.fetch(channelOptId).catch(() => null);
    if (!fetched?.isTextBased()) return { error: "Укажите текстовый канал или ветку." };
    if ("isThread" in fetched && fetched.isThread()) {
      return { scopeId: fetched.parentId ?? fetched.id };
    }
    return { scopeId: fetched.id };
  }
  const scope = warningScopeChannelIdFromInteraction(interaction);
  if (!scope) return { error: "Не удалось определить канал." };
  return { scopeId: scope };
}

export async function handleModerationSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return;
  }

  const name = interaction.commandName;
  if (name === "mute") {
    const target = interaction.options.getUser("user", true);
    const minutes = interaction.options.getInteger("minutes") ?? 60;
    const reason = interaction.options.getString("reason")?.trim() || "Ручной мут модератором";
    if (target.bot) {
      await interaction.reply({ content: "Нельзя замутить бота.", flags: MessageFlags.Ephemeral });
      return;
    }
    let member: GuildMember;
    try {
      member = await guild.members.fetch({ user: target.id });
    } catch {
      await interaction.reply({ content: "Пользователь не на сервере.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!member.moderatable) {
      await interaction.reply({ content: "Не могу изменить таймаут этого пользователя (роль выше?).", flags: MessageFlags.Ephemeral });
      return;
    }
    const ms = Math.min(minutes * 60_000, 2_419_200_000);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await member.timeout(ms, reason);
    } catch (err) {
      await interaction.editReply({
        content: `Не удалось выдать таймаут: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    await saveState(LAST_SEEN_STATE_FILE);
    await logModerationEvent(guild, {
      title: "Staff: /mute",
      color: 0x9966cc,
      targetUserId: target.id,
      channelId: interaction.channelId,
      parentChannelId: interaction.channel?.isThread() ? interaction.channel.parentId ?? undefined : undefined,
      reason,
      staffUserId: interaction.user.id,
      timeoutMs: ms,
    });
    await interaction.editReply({ content: `Таймаут ${minutes} мин. для <@${target.id}>.` });
    return;
  }

  if (name === "unmute") {
    const target = interaction.options.getUser("user", true);
    if (target.bot) {
      await interaction.reply({ content: "Некорректная цель.", flags: MessageFlags.Ephemeral });
      return;
    }
    let member: GuildMember;
    try {
      member = await guild.members.fetch({ user: target.id });
    } catch {
      await interaction.reply({ content: "Пользователь не на сервере.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!member.moderatable) {
      await interaction.reply({ content: "Не могу снять таймаут (роль выше?).", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await member.timeout(null, "Снят модератором");
    } catch (err) {
      await interaction.editReply({
        content: `Не удалось снять таймаут: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    await saveState(LAST_SEEN_STATE_FILE);
    await logModerationEvent(guild, {
      title: "Staff: /unmute",
      color: 0x669966,
      targetUserId: target.id,
      channelId: interaction.channelId,
      parentChannelId: interaction.channel?.isThread() ? interaction.channel.parentId ?? undefined : undefined,
      reason: "Снят таймаут",
      staffUserId: interaction.user.id,
    });
    await interaction.editReply({ content: `Таймаут снят с <@${target.id}>.` });
    return;
  }

  if (name === "warn") {
    const target = interaction.options.getUser("user", true);
    const chOpt = interaction.options.getChannel("channel");
    const amount = interaction.options.getInteger("amount") ?? 1;
    const reason = interaction.options.getString("reason")?.trim() || "Предупреждение модератором";
    if (target.bot) {
      await interaction.reply({ content: "Некорректная цель.", flags: MessageFlags.Ephemeral });
      return;
    }
    const resolved = await resolveWarningScope(interaction, chOpt?.id ?? null);
    if ("error" in resolved) {
      await interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
      return;
    }
    const before = getMinorWarningCount(interaction.guildId, resolved.scopeId, target.id);
    const after = adjustMinorWarningCount(interaction.guildId, resolved.scopeId, target.id, amount);
    await saveState(LAST_SEEN_STATE_FILE);
    await logModerationEvent(guild, {
      title: "Staff: /warn",
      color: 0x3388cc,
      targetUserId: target.id,
      channelId: resolved.scopeId,
      reason,
      minorWarningsInChannel: after,
      staffUserId: interaction.user.id,
    });
    await interaction.reply({
      content: `Предупреждения <@${target.id}> в <#${resolved.scopeId}>: ${before} → ${after}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (name === "unwarn") {
    const target = interaction.options.getUser("user", true);
    const chOpt = interaction.options.getChannel("channel");
    const amount = interaction.options.getInteger("amount") ?? 1;
    const clear = interaction.options.getBoolean("clear") === true;
    if (target.bot) {
      await interaction.reply({ content: "Некорректная цель.", flags: MessageFlags.Ephemeral });
      return;
    }
    const resolved = await resolveWarningScope(interaction, chOpt?.id ?? null);
    if ("error" in resolved) {
      await interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
      return;
    }
    const before = getMinorWarningCount(interaction.guildId, resolved.scopeId, target.id);
    let after: number;
    if (clear) {
      setMinorWarningCount(interaction.guildId, resolved.scopeId, target.id, 0);
      after = 0;
    } else {
      after = adjustMinorWarningCount(interaction.guildId, resolved.scopeId, target.id, -amount);
    }
    await saveState(LAST_SEEN_STATE_FILE);
    await logModerationEvent(guild, {
      title: "Staff: /unwarn",
      color: 0x888888,
      targetUserId: target.id,
      channelId: resolved.scopeId,
      reason: clear ? "Сброс предупреждений" : `−${amount}`,
      minorWarningsInChannel: after,
      staffUserId: interaction.user.id,
    });
    await interaction.reply({
      content: `Предупреждения <@${target.id}> в <#${resolved.scopeId}>: ${before} → ${after}.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
