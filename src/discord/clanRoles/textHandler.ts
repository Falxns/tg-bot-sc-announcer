import type { Message } from "discord.js";
import { clanRolesConfigured } from "../../config";
import { isDiscordModerator } from "../guildPermissions";
import { applyLightStrikeForMessage, notifyUserEphemeralFallback } from "../moderation";
import { discordModerationLogTitles as logTitles } from "../userStrings";
import { isClanRulesThread } from "./helpers";
import { submitCreateRequestFromText } from "./modQueue";
import { performDirectRemove, submitGrantRequest } from "./panel";
import { ensureGuildMembersCached } from "./resolver";
import { isClanCommandMessage, parseClanTextCommand } from "./textCommands";
import { clanTxt } from "./strings";

async function replyClanFeedback(message: Message, content: string, ephemeral: boolean): Promise<void> {
  if (ephemeral) {
    await notifyUserEphemeralFallback(message, content);
    return;
  }
  await message.reply({ content, allowedMentions: { parse: [] } }).catch(() => undefined);
}

export async function handleClanRulesMessage(message: Message): Promise<boolean> {
  if (!message.inGuild() || !message.guild || message.author.bot) return false;
  if (!clanRolesConfigured()) return false;
  if (!message.channel.isThread()) return false;
  if (!(await isClanRulesThread(message.guild, message.channel))) return false;

  const member = message.member;
  if (!member) return false;

  if (!isClanCommandMessage(message.content)) {
    if (isDiscordModerator(member)) return true;
    await applyLightStrikeForMessage(
      message,
      member,
      clanTxt.clanThreadOffTopicReason,
      logTitles.minorWarnOnly,
    );
    return true;
  }

  await ensureGuildMembersCached(message.guild);

  const parsed = parseClanTextCommand(message.guild, member, message.content, message.mentions);
  if (!parsed) return true;

  if ("kind" in parsed && parsed.kind === "error") {
    await replyClanFeedback(message, parsed.message, true);
    return true;
  }

  if (parsed.kind === "grant") {
    const target = await message.guild.members.fetch(parsed.targetUserId).catch(() => null);
    if (!target) {
      await replyClanFeedback(message, clanTxt.targetMissing, true);
      return true;
    }
    await submitGrantRequest(
      message.guild,
      message.channel,
      message.author.id,
      parsed.clanRole,
      parsed.targetUserId,
    );
    await replyClanFeedback(message, clanTxt.grantRequestSent, true);
    return true;
  }

  if (parsed.kind === "remove") {
    const removed = await performDirectRemove(
      message.guild,
      member,
      parsed.clanRole,
      parsed.targetUserId,
    );
    if (!removed.ok) {
      await replyClanFeedback(message, removed.error, true);
      return true;
    }
    const targetLabel =
      parsed.targetUserId === message.author.id ? "вас" : removed.target.toString();
    await replyClanFeedback(
      message,
      clanTxt.cmdRemoveDoneTarget(parsed.clanRole.name, targetLabel),
      true,
    );
    return true;
  }

  if (parsed.kind === "create") {
    const err = await submitCreateRequestFromText(message.guild, message.author.id, message.channel.id, parsed);
    if (err) {
      await replyClanFeedback(message, err, true);
      return true;
    }
    await replyClanFeedback(message, clanTxt.cmdCreateSubmitted, true);
    return true;
  }

  return true;
}
