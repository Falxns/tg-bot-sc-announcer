import { DISCORD_CLAN_COLOR_PRESETS_FROM_ENV } from "../../config";
import { setClanColorPresetsFromEnv } from "./colorPresets";

export {
  handleClanPanelButton,
  handleClanStringSelect,
  handleClanUserSelect,
  isClanPanelCustomId,
} from "./panel";
export { handleClanWizardMessage, handleClanWizardStringSelect, handleClanWizardButton, isClanWizardCustomId } from "./createWizard";
export { handleClanModButton, handleClanModModal, isClanModCustomId } from "./modQueue";
export { handleClanSlashCommand, clanPanelSlashCommand, clanslistSlashCommand } from "./commands";

export function initClanRolesModule(): void {
  setClanColorPresetsFromEnv(DISCORD_CLAN_COLOR_PRESETS_FROM_ENV);
}

export function isClanRolesInteractionCustomId(customId: string): boolean {
  return (
    customId.startsWith("clan:panel:") ||
    customId.startsWith("clan:sel:") ||
    customId.startsWith("clan:req:") ||
    customId.startsWith("clan:wiz:") ||
    customId.startsWith("clan:mod:")
  );
}
