import type { Message } from "discord.js";
import { clanRolesConfigured } from "../../config";
import { isClanModerator } from "./permissions";
import { applyLightStrikeForMessage, replyInChannelAutoDelete } from "../moderation";
import { discordModerationLogTitles as logTitles } from "../userStrings";
import { isClanRulesThread } from "./helpers";
import { submitCreateRequestFromText } from "./modQueue";
import {
  performDirectLeaderMetaRemove,
  submitLeaderMetaGrantRequest,
} from "./leaderMeta";
import { performDirectRemove, submitGrantRequest } from "./panel";
import { sendClanRosterDm } from "./roster";
import { changeClanRoleColor } from "./colorChange";
import { ensureGuildMembersCached } from "./resolver";
import { isClanCommandMessage, parseClanTextCommand } from "./textCommands";
import { clanTxt } from "./strings";

async function replyClanCommandError(message: Message, content: string): Promise<void> {
  await replyInChannelAutoDelete(message, content, { deleteUserMessage: true });
}

export async function handleClanRulesMessage(message: Message): Promise<boolean> {
  if (!message.inGuild() || !message.guild || message.author.bot) return false;
  if (!clanRolesConfigured()) return false;
  if (!message.channel.isThread()) return false;
  if (!(await isClanRulesThread(message.guild, message.channel))) return false;

  const member = message.member;
  if (!member) return false;

  if (!isClanCommandMessage(message.content)) {
    if (isClanModerator(member)) return true;
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
    await replyClanCommandError(message, parsed.message);
    return true;
  }

  if (parsed.kind === "grant") {
    const target = await message.guild.members.fetch(parsed.targetUserId).catch(() => null);
    if (!target) {
      await replyClanCommandError(message, clanTxt.targetMissing);
      return true;
    }
    const err = await submitGrantRequest(
      message.guild,
      message.channel,
      message.author.id,
      parsed.clanRole,
      parsed.targetUserId,
      false,
      message.id,
    );
    if (err) {
      await replyClanCommandError(message, err);
      return true;
    }
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
      await replyClanCommandError(message, removed.error);
      return true;
    }
    const targetLabel =
      parsed.targetUserId === message.author.id ? "вас" : removed.target.toString();
    await replyInChannelAutoDelete(
      message,
      clanTxt.cmdRemoveDoneTarget(parsed.clanRole.name, targetLabel),
    );
    return true;
  }

  if (parsed.kind === "create") {
    const err = await submitCreateRequestFromText(
      message.guild,
      message.author.id,
      message.channel.id,
      parsed,
      message.id,
    );
    if (err) {
      await replyClanCommandError(message, err);
      return true;
    }
    return true;
  }

  if (parsed.kind === "grant_leader") {
    const err = await submitLeaderMetaGrantRequest(
      message.guild,
      message.channel,
      message.author.id,
      parsed.clanRole,
      parsed.targetUserId,
      message.id,
    );
    if (err) {
      await replyClanCommandError(message, err);
      return true;
    }
    return true;
  }

  if (parsed.kind === "remove_leader") {
    const removed = await performDirectLeaderMetaRemove(
      message.guild,
      member,
      parsed.clanRole,
      parsed.targetUserId,
    );
    if (!removed.ok) {
      await replyClanCommandError(message, removed.error);
      return true;
    }
    const targetLabel =
      parsed.targetUserId === message.author.id ? "вас" : removed.target.toString();
    await replyInChannelAutoDelete(
      message,
      clanTxt.cmdRemoveLeaderDoneTarget(parsed.clanRole.name, targetLabel),
    );
    return true;
  }

  if (parsed.kind === "roster") {
    const result = await sendClanRosterDm(message.guild, member, parsed.clanRole);
    if (!result.ok) {
      await replyClanCommandError(message, result.error);
      return true;
    }
    await replyInChannelAutoDelete(message, clanTxt.cmdRosterDmSent);
    return true;
  }

  if (parsed.kind === "change_color") {
    const result = await changeClanRoleColor(
      message.guild,
      member,
      parsed.clanRole,
      parsed.colorPreset,
    );
    if (!result.ok) {
      await replyClanCommandError(message, result.error);
      return true;
    }
    await replyInChannelAutoDelete(
      message,
      clanTxt.cmdColorDone(parsed.clanRole.name, parsed.colorPreset.label),
    );
    return true;
  }

  return true;
}
