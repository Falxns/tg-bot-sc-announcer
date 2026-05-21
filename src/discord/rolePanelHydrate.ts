import { ButtonInteraction, ButtonStyle, ComponentType, Message } from "discord.js";
import { LAST_SEEN_STATE_FILE, LOG_LEVEL } from "../config";
import { peelFirstCustomDiscordEmojiFromLabel } from "./buttonEmoji";
import { getDiscordRolePanel, saveState, setDiscordRolePanel } from "../state";
import type { PendingLinkPanelLink } from "./postPending";
import type { DiscordRolePanelButton, DiscordRolePanelState } from "./types";

const ROLE_BUTTON_PREFIX = "role:";
const ROLE_BUTTON_SINGLE_PREFIX = "roleone:";

function parseRoleButtonCustomId(customId: string): { roleId: string; singleRole: boolean } | null {
  if (customId.startsWith(ROLE_BUTTON_PREFIX)) {
    return { roleId: customId.slice(ROLE_BUTTON_PREFIX.length).trim(), singleRole: false };
  }
  if (customId.startsWith(ROLE_BUTTON_SINGLE_PREFIX)) {
    return { roleId: customId.slice(ROLE_BUTTON_SINGLE_PREFIX.length).trim(), singleRole: true };
  }
  return null;
}

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
  let singleRole = false;
  for (const row of rows) {
    if (row.type !== ComponentType.ActionRow) continue;
    for (const comp of row.components) {
      if (comp.type !== ComponentType.Button) continue;
      const customId = comp.customId ?? "";
      const parsed = parseRoleButtonCustomId(customId);
      if (!parsed) continue;
      const { roleId } = parsed;
      if (!roleId) continue;
      if (parsed.singleRole) singleRole = true;
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
    singleRole,
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

/** Rebuild link-panel button specs from a bot message (link-style buttons only). */
export function parseLinkPanelLinksFromMessage(message: Message, botUserId: string): PendingLinkPanelLink[] | null {
  if (!message.guildId || !message.channelId) return null;
  if (message.author?.id !== botUserId) return null;
  const rows = message.components;
  if (!rows?.length) return null;
  const links: PendingLinkPanelLink[] = [];
  for (const row of rows) {
    if (row.type !== ComponentType.ActionRow) continue;
    for (const comp of row.components) {
      if (comp.type !== ComponentType.Button) continue;
      if (comp.style !== ButtonStyle.Link || !comp.url) continue;
      const url = comp.url;
      const labelRaw = comp.label?.trim() ?? "";
      const { remainder, emoji } = peelFirstCustomDiscordEmojiFromLabel(labelRaw);
      const label = remainder.trim();
      links.push({
        url,
        label: label.length > 0 ? label : url,
        ...(emoji ? { emoji } : {}),
      });
    }
  }
  return links.length > 0 ? links : null;
}

/** Apply single-role vs multi-role customId prefix without changing labels. */
export function reapplyRolePanelButtonPrefixes(
  buttons: readonly DiscordRolePanelButton[],
  singleRole: boolean,
): DiscordRolePanelButton[] {
  const prefix = singleRole ? ROLE_BUTTON_SINGLE_PREFIX : ROLE_BUTTON_PREFIX;
  return buttons.map((b) => ({
    customId: `${prefix}${b.roleId}`,
    roleId: b.roleId,
    label: b.label,
  }));
}
