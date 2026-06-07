import type { Guild, GuildMember, Role } from "discord.js";
import {
  DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_MS,
  LAST_SEEN_STATE_FILE,
} from "../../config";
import {
  deleteClanColorChangeCooldown,
  getClanColorChangeCooldown,
  setClanColorChangeCooldown,
} from "../../state";
import type { ClanColorPreset } from "../../config";
import { isClanModerator } from "./permissions";
import { isClanLeaderFor } from "./resolver";
import { persistClanState, postClanAuditLine } from "./actions";
import { clanTxt } from "./strings";
import { discordFormatDurationRu } from "../userStrings";

export async function changeClanRoleColor(
  guild: Guild,
  actor: GuildMember,
  clanRole: Role,
  preset: ClanColorPreset,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const isMod = isClanModerator(actor);

  if (!isMod && !isClanLeaderFor(actor, clanRole.id)) {
    return { ok: false, error: clanTxt.cmdColorNotYourClan(clanRole.name) };
  }

  if (!isMod) {
    const nowMs = Date.now();
    const cooldown = getClanColorChangeCooldown(guild.id, clanRole.id);
    if (cooldown && nowMs - cooldown.changedAtMs < DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_MS) {
      const remainingMs = DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_MS - (nowMs - cooldown.changedAtMs);
      return { ok: false, error: clanTxt.cmdColorCooldown(discordFormatDurationRu(remainingMs)) };
    }
    if (cooldown && nowMs - cooldown.changedAtMs >= DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_MS) {
      deleteClanColorChangeCooldown(guild.id, clanRole.id);
    }
  }

  if (clanRole.color === preset.hex) {
    return { ok: false, error: clanTxt.cmdColorAlreadySet(preset.label) };
  }

  if (!clanRole.editable) {
    return { ok: false, error: clanTxt.cmdColorRoleNotEditable };
  }

  try {
    await clanRole.edit({
      colors: { primaryColor: preset.hex },
      reason: isMod
        ? `Clan color change (mod): ${clanRole.name} → ${preset.label}`
        : `Clan color change (leader): ${clanRole.name} → ${preset.label}`,
    });
  } catch {
    return { ok: false, error: clanTxt.noManageRoles };
  }

  if (!isMod) {
    setClanColorChangeCooldown({
      guildId: guild.id,
      clanRoleId: clanRole.id,
      changedAtMs: Date.now(),
    });
  }

  const auditLine = isMod
    ? clanTxt.auditColorChangeMod(actor.toString(), clanRole.name, preset.label)
    : clanTxt.auditColorChangeLeader(actor.toString(), clanRole.name, preset.label);
  await postClanAuditLine(guild, auditLine);
  await persistClanState(LAST_SEEN_STATE_FILE);

  return { ok: true };
}
