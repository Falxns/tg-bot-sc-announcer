import { ButtonInteraction, ComponentType, Message } from "discord.js";
import { LAST_SEEN_STATE_FILE, LOG_LEVEL } from "../config";
import { getDiscordRolePanel, saveState, setDiscordRolePanel } from "../state";
import type { DiscordRolePanelButton, DiscordRolePanelState } from "./types";

/**
 * Rebuild role-panel state from a message the bot sent, using current button components.
 * Used after restarts when JSON state was lost but the Discord message still exists.
 */
export function parseRolePanelStateFromMessage(message: Message, botUserId: string): DiscordRolePanelState | null {
  if (!message.guildId || !message.channelId) return null;
  if (message.author?.id !== botUserId) return null;
  const rows = message.components;
  if (!rows?.length) return null;
  const buttons: DiscordRolePanelButton[] = [];
  for (const row of rows) {
    if (row.type !== ComponentType.ActionRow) continue;
    for (const comp of row.components) {
      if (comp.type !== ComponentType.Button) continue;
      const customId = comp.customId ?? "";
      if (!customId.startsWith("role:")) continue;
      const roleId = customId.slice("role:".length).trim();
      if (!roleId) continue;
      const labelRaw = comp.label?.trim() ?? "";
      buttons.push({
        customId,
        roleId,
        label: labelRaw.length > 0 ? labelRaw : "\u200b",
      });
    }
  }
  if (buttons.length === 0) return null;
  return {
    messageId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    buttons,
  };
}

/** Load panel from memory, or rebuild from the interaction message and persist. */
export async function getOrRehydrateRolePanel(interaction: ButtonInteraction): Promise<DiscordRolePanelState | undefined> {
  const cached = getDiscordRolePanel(interaction.message.id);
  if (cached) return cached;
  const botId = interaction.client.user?.id;
  if (!botId) return undefined;

  let message: Message = interaction.message;
  if (!message.components?.length && interaction.channel?.isTextBased() && "messages" in interaction.channel) {
    const fetched = await interaction.channel.messages.fetch(message.id).catch(() => null);
    if (fetched) message = fetched;
  }

  const rebuilt = parseRolePanelStateFromMessage(message, botId);
  if (!rebuilt) return undefined;
  setDiscordRolePanel(rebuilt);
  await saveState(LAST_SEEN_STATE_FILE);
  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(
      `[Discord] rehydrated role panel from message ${rebuilt.messageId} (${rebuilt.buttons.length} button(s))`,
    );
  }
  return rebuilt;
}
