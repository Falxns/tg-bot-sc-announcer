import fs from "fs";
import path from "path";
import { AttachmentBuilder } from "discord.js";
import { DISCORD_VOICE_PANEL_IMAGE_URL } from "../../config";

export const VOICE_PANEL_LEGEND_FILENAME = "voice-panel-legend.png";

const LEGEND_CANDIDATE_PATHS = [
  path.join(process.cwd(), "assets/discord/voice-panel-legend.png"),
  path.join(__dirname, "../../../assets/discord/voice-panel-legend.png"),
];

function resolveBundledLegendPath(): string | null {
  for (const candidate of LEGEND_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export type VoicePanelLegendAttachment = {
  imageUrl: string;
  files: AttachmentBuilder[];
};

/** Bundled PNG attachment, or external URL from env, or null if neither is available. */
export function buildVoicePanelLegendAttachment(): VoicePanelLegendAttachment | null {
  const externalUrl = DISCORD_VOICE_PANEL_IMAGE_URL.trim();
  if (externalUrl.length > 0) {
    return { imageUrl: externalUrl, files: [] };
  }
  const filePath = resolveBundledLegendPath();
  if (!filePath) return null;
  return {
    imageUrl: `attachment://${VOICE_PANEL_LEGEND_FILENAME}`,
    files: [new AttachmentBuilder(filePath).setName(VOICE_PANEL_LEGEND_FILENAME)],
  };
}
