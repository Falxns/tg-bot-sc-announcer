import type { Message } from "discord.js";
import { clanRolesConfigured } from "../../config";
import {
  buildFallbackClanPanel,
  getClanRulesPanelForGuild,
  isClanRulesThread,
} from "./helpers";
import { submitCreateRequestFromText } from "./modQueue";
import { performDirectRemove, submitGrantRequest } from "./panel";
import { ensureGuildMembersCached } from "./resolver";
import { parseClanTextCommand } from "./textCommands";
import { clanTxt } from "./strings";

export async function handleClanRulesMessage(message: Message): Promise<boolean> {
  if (!message.inGuild() || !message.guild || message.author.bot) return false;
  if (!clanRolesConfigured()) return false;
  if (!message.channel.isThread()) return false;
  if (!(await isClanRulesThread(message.guild, message.channel))) return false;

  const member = message.member;
  if (!member) return false;

  await ensureGuildMembersCached(message.guild);

  const parsed = parseClanTextCommand(message.guild, member, message.content, message.mentions);
  if (!parsed) return false;

  if ("kind" in parsed && parsed.kind === "error") {
    await message.reply(parsed.message).catch(() => undefined);
    return true;
  }

  const panel =
    getClanRulesPanelForGuild(message.guild.id) ??
    buildFallbackClanPanel(message.guild.id, message.channel.parentId ?? message.channel.id);

  if (parsed.kind === "grant") {
    const target = await message.guild.members.fetch(parsed.targetUserId).catch(() => null);
    if (!target) {
      await message.reply(clanTxt.targetMissing).catch(() => undefined);
      return true;
    }
    await submitGrantRequest(
      message.guild,
      panel,
      message.author.id,
      parsed.clanRole,
      parsed.targetUserId,
    );
    await message.reply(clanTxt.grantRequestSent).catch(() => undefined);
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
      await message.reply(removed.error).catch(() => undefined);
      return true;
    }
    const targetLabel =
      parsed.targetUserId === message.author.id
        ? "вас"
        : (removed.target.toString());
    await message
      .reply(clanTxt.cmdRemoveDoneTarget(parsed.clanRole.name, targetLabel))
      .catch(() => undefined);
    return true;
  }

  if (parsed.kind === "create") {
    const err = await submitCreateRequestFromText(message.guild, message.author.id, message.channel.id, parsed);
    if (err) {
      await message.reply(err).catch(() => undefined);
      return true;
    }
    await message.reply(clanTxt.cmdCreateSubmitted).catch(() => undefined);
    return true;
  }

  return false;
}
