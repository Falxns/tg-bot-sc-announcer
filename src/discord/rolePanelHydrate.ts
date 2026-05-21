import { ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, ComponentType, Message } from "discord.js";
import { LAST_SEEN_STATE_FILE, LOG_LEVEL } from "../config";
import { peelFirstCustomDiscordEmojiFromLabel } from "./buttonEmoji";
import { getDiscordRolePanel, saveState, setDiscordRolePanel } from "../state";
import type { PendingLinkPanelLink } from "./postPending";
import type { DiscordRolePanelButton, DiscordRolePanelState } from "./types";
import { discordSlashLinkPanel as lp } from "./userStrings";

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

const ROLE_PANEL_MAX_SLOTS = 6;
const LINK_PANEL_MAX_SLOTS = 5;
const LINK_BUTTON_URL_MAX = 512;
const DISCORD_BUTTON_LABEL_MAX = 80;

export function hasRolePanelSlotUpdates(interaction: ChatInputCommandInteraction): boolean {
  for (let i = 1; i <= ROLE_PANEL_MAX_SLOTS; i++) {
    if (interaction.options.getRole(`role${i}`)) return true;
    const label = interaction.options.getString(`label${i}`)?.trim();
    if (label && label.length > 0) return true;
  }
  return false;
}

/** Merge slash `roleN` / `labelN` into existing buttons by slot index (1-based). */
export function mergeRolePanelButtonsFromInteraction(
  interaction: ChatInputCommandInteraction,
  existing: readonly DiscordRolePanelButton[],
  singleRole: boolean,
): DiscordRolePanelButton[] {
  const prefix = singleRole ? ROLE_BUTTON_SINGLE_PREFIX : ROLE_BUTTON_PREFIX;
  const slots: (DiscordRolePanelButton | undefined)[] = [];
  for (let i = 0; i < ROLE_PANEL_MAX_SLOTS; i++) {
    slots[i] = existing[i];
  }

  for (let i = 1; i <= ROLE_PANEL_MAX_SLOTS; i++) {
    const role = interaction.options.getRole(`role${i}`);
    const labelRaw = interaction.options.getString(`label${i}`)?.trim();
    if (role) {
      const label = labelRaw && labelRaw.length > 0 ? labelRaw : role.name;
      slots[i - 1] = {
        customId: `${prefix}${role.id}`,
        roleId: role.id,
        label,
      };
    } else if (labelRaw && labelRaw.length > 0 && slots[i - 1]) {
      slots[i - 1] = { ...slots[i - 1]!, label: labelRaw };
    }
  }

  let lastIdx = -1;
  for (let i = ROLE_PANEL_MAX_SLOTS - 1; i >= 0; i--) {
    if (slots[i]) {
      lastIdx = i;
      break;
    }
  }
  const trimmed = slots.slice(0, lastIdx + 1).filter((b): b is DiscordRolePanelButton => !!b);

  const usedRoles = new Set<string>();
  return trimmed.filter((b) => {
    if (usedRoles.has(b.roleId)) return false;
    usedRoles.add(b.roleId);
    return true;
  });
}

function parseLinkButtonUrl(raw: string | null | undefined): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    if (u.href.length > LINK_BUTTON_URL_MAX) return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

function defaultLinkButtonLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").slice(0, DISCORD_BUTTON_LABEL_MAX);
  } catch {
    return lp.linkFallbackLabel;
  }
}

function linkSlotFromUrlAndLabel(url: string, labelFromUser?: string): PendingLinkPanelLink {
  const baseForPeel =
    labelFromUser && labelFromUser.length > 0 ? labelFromUser : defaultLinkButtonLabel(url);
  const { remainder, emoji } = peelFirstCustomDiscordEmojiFromLabel(baseForPeel);
  let label = remainder.trim().slice(0, DISCORD_BUTTON_LABEL_MAX);
  if (label.length === 0 && !emoji) label = defaultLinkButtonLabel(url);
  return { url, label, ...(emoji ? { emoji } : {}) };
}

export function hasLinkPanelSlotUpdates(interaction: ChatInputCommandInteraction): boolean {
  for (let i = 1; i <= LINK_PANEL_MAX_SLOTS; i++) {
    if (interaction.options.getString(`url${i}`)?.trim()) return true;
    const label = interaction.options.getString(`label${i}`)?.trim();
    if (label && label.length > 0) return true;
  }
  return false;
}

/** Merge slash `urlN` / `labelN` into existing links by slot index (1-based). Returns null if a provided URL is invalid. */
export function mergeLinkPanelLinksFromInteraction(
  interaction: ChatInputCommandInteraction,
  existing: readonly PendingLinkPanelLink[],
): PendingLinkPanelLink[] | null {
  const slots: (PendingLinkPanelLink | undefined)[] = [];
  for (let i = 0; i < LINK_PANEL_MAX_SLOTS; i++) {
    slots[i] = existing[i];
  }

  for (let i = 1; i <= LINK_PANEL_MAX_SLOTS; i++) {
    const urlRaw = interaction.options.getString(`url${i}`);
    const labelFromUser = interaction.options.getString(`label${i}`)?.trim();
    if (urlRaw !== null && urlRaw !== undefined) {
      const trimmed = urlRaw.trim();
      if (trimmed.length > 0) {
        const url = parseLinkButtonUrl(trimmed);
        if (!url) return null;
        slots[i - 1] = linkSlotFromUrlAndLabel(url, labelFromUser);
        continue;
      }
    }
    if (labelFromUser && labelFromUser.length > 0 && slots[i - 1]) {
      slots[i - 1] = linkSlotFromUrlAndLabel(slots[i - 1]!.url, labelFromUser);
    }
  }

  let lastIdx = -1;
  for (let i = LINK_PANEL_MAX_SLOTS - 1; i >= 0; i--) {
    if (slots[i]) {
      lastIdx = i;
      break;
    }
  }
  return slots.slice(0, lastIdx + 1).filter((b): b is PendingLinkPanelLink => !!b);
}
