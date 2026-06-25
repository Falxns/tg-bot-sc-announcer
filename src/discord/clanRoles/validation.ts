import type { Guild } from "discord.js";
import { DISCORD_CLAN_LEADER_ROLE_ID, DISCORD_CLAN_RECRUITER_ROLE_ID, clanRolesConfigured } from "../../config";
import { resolveGuildMetaRole } from "./resolver";

/** Log misconfigured or missing clan meta-roles once on bot ready. */
export async function validateClanMetaRolesOnReady(guild: Guild): Promise<void> {
  if (!clanRolesConfigured()) return;

  const checks: Array<{ envKey: string; roleId: string }> = [
    { envKey: "DISCORD_CLAN_LEADER_ROLE_ID", roleId: DISCORD_CLAN_LEADER_ROLE_ID },
    { envKey: "DISCORD_CLAN_RECRUITER_ROLE_ID", roleId: DISCORD_CLAN_RECRUITER_ROLE_ID },
  ];

  for (const { envKey, roleId } of checks) {
    if (!roleId) {
      console.error(`[Clan] ${envKey} is not set — clan role commands are disabled.`);
      continue;
    }
    const role = await resolveGuildMetaRole(guild, roleId);
    if (!role) {
      console.error(
        `[Clan] ${envKey}=${roleId} — role not found in guild ${guild.id}. ` +
          `Copy the role ID from Server Settings → Roles and restart the bot.`,
      );
    }
  }
}
