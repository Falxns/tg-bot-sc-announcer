import type { Message } from "discord.js";
import { clanRolesConfigured } from "../../config";
import { isDiscordModerator } from "../guildPermissions";
import { applyLightStrikeForMessage, replyInChannelAutoDelete } from "../moderation";
import { discordModerationLogTitles as logTitles } from "../userStrings";
import { isClanRulesThread } from "./helpers";
import { submitCreateRequestFromText } from "./modQueue";
import {
  performDirectLeaderMetaRemove,
  submitLeaderMetaGrantRequest,
} from "./leaderMeta";
import { performDirectRemove, submitGrantRequest } from "./panel";
import { countClanLeaders } from "./resolver";
import { ensureGuildMembersCached } from "./resolver";
import { isClanCommandMessage, parseClanTextCommand } from "./textCommands";
import { clanTxt } from "./strings";

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
    await replyInChannelAutoDelete(message, parsed.message);
    return true;
  }

  if (parsed.kind === "grant") {
    const target = await message.guild.members.fetch(parsed.targetUserId).catch(() => null);
    if (!target) {
      await replyInChannelAutoDelete(message, clanTxt.targetMissing);
      return true;
    }
    await submitGrantRequest(
      message.guild,
      message.channel,
      message.author.id,
      parsed.clanRole,
      parsed.targetUserId,
    );
    await replyInChannelAutoDelete(message, clanTxt.grantRequestSent);
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
      await replyInChannelAutoDelete(message, removed.error);
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
    const err = await submitCreateRequestFromText(message.guild, message.author.id, message.channel.id, parsed);
    if (err) {
      await replyInChannelAutoDelete(message, err);
      return true;
    }
    await replyInChannelAutoDelete(message, clanTxt.cmdCreateSubmitted);
    return true;
  }

  if (parsed.kind === "grant_leader") {
    const err = await submitLeaderMetaGrantRequest(
      message.guild,
      message.channel,
      message.author.id,
      parsed.clanRole,
      parsed.targetUserId,
    );
    if (err) {
      await replyInChannelAutoDelete(message, err);
      return true;
    }
    const leaderCount = await countClanLeaders(message.guild, parsed.clanRole.id);
    const reply =
      leaderCount === 1 ? clanTxt.leaderMetaGrantRequestSent : clanTxt.leaderMetaGrantRequestSentMod;
    await replyInChannelAutoDelete(message, reply);
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
      await replyInChannelAutoDelete(message, removed.error);
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

  return true;
}
