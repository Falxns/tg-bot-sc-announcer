import { DISCORD_CLAN_COLOR_PRESETS_FROM_ENV } from "../../config";
import { setClanColorPresetsFromEnv } from "./colorPresets";

export { handleClanGrantButton, isClanGrantCustomId } from "./panel";
export {
  handleClanLeaderMetaClanButton,
  isClanLeaderMetaClanCustomId,
} from "./leaderMeta";
export { handleClanModButton, handleClanModModal, isClanModCustomId } from "./modQueue";
export { handleClanSlashCommand, clanPanelSlashCommand, clanslistSlashCommand, clancheckSlashCommand } from "./commands";
export { handleClanRulesMessage } from "./textHandler";
export { startClanEnforcementScheduler, stopClanEnforcementScheduler } from "./enforcement";
export { startClanThreadCleanupScheduler, stopClanThreadCleanupScheduler } from "./threadCleanup";

export function initClanRolesModule(): void {
  setClanColorPresetsFromEnv(DISCORD_CLAN_COLOR_PRESETS_FROM_ENV);
}

export function isClanRolesInteractionCustomId(customId: string): boolean {
  return (
    customId.startsWith("clan:req:") ||
    customId.startsWith("clan:mod:") ||
    customId.startsWith("clan:ldr:")
  );
}
