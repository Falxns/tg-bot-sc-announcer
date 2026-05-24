import {
  ActionRowBuilder,
  APIInteractionGuildMember,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  GuildMember,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { Message } from "discord.js";
import { DISCORD_ROLE_PANEL_CHANNEL_ID, LAST_SEEN_STATE_FILE, LOG_LEVEL } from "../config";
import { isDiscordAdmin } from "./guildPermissions";
import { handleVoicePanelCommand, voicePanelSlashCommand } from "./tempVoice/commands";
import { saveState, setDiscordRolePanel } from "../state";
import {
  banSlashCommand,
  handleModerationSlashCommand,
  modstatusSlashCommand,
  muteSlashCommand,
  unbanSlashCommand,
  unmuteSlashCommand,
  strikeSlashCommand,
  unstrikeSlashCommand,
} from "./moderationCommands";
import { peelFirstCustomDiscordEmojiFromLabel, type ParsedButtonEmoji } from "./buttonEmoji";
import {
  createPendingEdit,
  createPendingEditLinkPanel,
  createPendingEditRolePanel,
  createPendingLinkPanel,
  createPendingPost,
  createPendingRolePanel,
  takePendingEdit,
  takePendingEditLinkPanel,
  takePendingEditRolePanel,
  takePendingLinkPanel,
  takePendingPost,
  takePendingRolePanel,
  type PendingAttachmentRef,
  type PendingEditBaselineEmbed,
  type PendingEditPayload,
  type PendingEditLinkPanelPayload,
  type PendingEditRolePanelPayload,
  type PendingLinkPanelPayload,
  type PendingLinkPanelLink,
  type PendingPostPayload,
  type PendingRolePanelPayload,
} from "./postPending";
import {
  hasLinkPanelSlotUpdates,
  hasRolePanelSlotUpdates,
  mergeLinkPanelLinksFromInteraction,
  mergeRolePanelButtonsFromInteraction,
  parseLinkPanelLinksFromMessage,
  parseRolePanelStateFromMessage,
  reapplyRolePanelButtonPrefixes,
} from "./rolePanelHydrate";
import type { DiscordRolePanelButton } from "./types";
import {
  discordCommonReplies as com,
  discordFmtAttachmentPrepFail,
  discordFmtChannelSendFail,
  discordFmtEditDone,
  discordFmtLinkPanelDone,
  discordFmtPostPublished,
  discordFmtRolePanelCreated,
  discordFmtRolePanelWrongChannel,
  discordLinkPanelErrors as linkErr,
  discordRolePanelErrors as roleErr,
  discordSlashEmbedOptions as emb,
  discordSlashEdit as editTxt,
  discordSlashEditLinkPanel as elp,
  discordSlashEditRolePanel as erp,
  discordSlashLinkPanel as lp,
  discordSlashPost as postTxt,
  discordSlashRolePanel as rp,
} from "./userStrings";

/** Discord message `content` limit per message (bots). Long posts are split across multiple messages. */
const DISCORD_MESSAGE_CONTENT_MAX = 2000;
/** Discord `TextInput` label max length (discord.js / API). */
const DISCORD_TEXT_INPUT_LABEL_MAX = 45;
/** Discord `Button` label max length. */
const DISCORD_BUTTON_LABEL_MAX = 80;
const ROLE_BUTTON_PREFIX = "role:";
const ROLE_BUTTON_SINGLE_PREFIX = "roleone:";

function isDiscordSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id.trim());
}

const postCommand = new SlashCommandBuilder()
  .setName("post")
  .setDescription(postTxt.commandDescription)
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription(postTxt.channel)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("embed_title").setDescription(emb.embedTitle).setMaxLength(256).setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("embed_description").setDescription(emb.embedDescription).setMaxLength(4000).setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("embed_url").setDescription(emb.embedUrl).setMaxLength(2000).setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("embed_color")
      .setDescription(emb.embedColor)
      .setMaxLength(32)
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("embed_thumbnail_url").setDescription(emb.embedThumbnailUrl).setMaxLength(2000),
  )
  .addStringOption((opt) =>
    opt.setName("embed_image_url").setDescription(emb.embedImageUrl).setMaxLength(2000),
  )
  .addStringOption((opt) =>
    opt.setName("embed_footer").setDescription(emb.embedFooter).setMaxLength(2048),
  )
  .addStringOption((opt) =>
    opt.setName("embed_footer_icon_url").setDescription(emb.embedFooterIconUrl).setMaxLength(2000),
  )
  .addStringOption((opt) =>
    opt.setName("embed_author_name").setDescription(emb.embedAuthorName).setMaxLength(256),
  )
  .addStringOption((opt) =>
    opt.setName("embed_author_icon_url").setDescription(emb.embedAuthorIconUrl).setMaxLength(2000),
  )
  .addAttachmentOption((opt) =>
    opt.setName("image").setDescription(postTxt.image).setRequired(false),
  );

const editCommand = new SlashCommandBuilder()
  .setName("edit")
  .setDescription(editTxt.commandDescription)
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription(editTxt.channel)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("message_id")
      .setDescription(editTxt.messageId)
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(22),
  )
  .addStringOption((opt) =>
    opt.setName("embed_title").setDescription(emb.embedTitle).setMaxLength(256).setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("embed_description").setDescription(emb.embedDescription).setMaxLength(4000).setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("embed_url").setDescription(emb.embedUrl).setMaxLength(2000).setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("embed_color")
      .setDescription(emb.embedColor)
      .setMaxLength(32)
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName("embed_thumbnail_url").setDescription(emb.embedThumbnailUrl).setMaxLength(2000),
  )
  .addStringOption((opt) =>
    opt.setName("embed_image_url").setDescription(emb.embedImageUrl).setMaxLength(2000),
  )
  .addStringOption((opt) =>
    opt.setName("embed_footer").setDescription(emb.embedFooter).setMaxLength(2048),
  )
  .addStringOption((opt) =>
    opt.setName("embed_footer_icon_url").setDescription(emb.embedFooterIconUrl).setMaxLength(2000),
  )
  .addStringOption((opt) =>
    opt.setName("embed_author_name").setDescription(emb.embedAuthorName).setMaxLength(256),
  )
  .addStringOption((opt) =>
    opt.setName("embed_author_icon_url").setDescription(emb.embedAuthorIconUrl).setMaxLength(2000),
  )
  .addAttachmentOption((opt) =>
    opt.setName("image").setDescription(editTxt.image).setRequired(false),
  );

postCommand.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
editCommand.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

/** Embed options shared by `/rolepanel` and `/linkpanel`. */
function appendSharedPanelEmbedOptions(cmd: unknown): SlashCommandBuilder {
  const base = cmd as SlashCommandBuilder;
  return (
    base
      .addStringOption((opt) =>
        opt.setName("embed_title").setDescription(emb.embedTitle).setMaxLength(256).setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("embed_description").setDescription(emb.embedDescription).setMaxLength(4000).setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("embed_url").setDescription(emb.embedUrl).setMaxLength(2000).setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("embed_color")
          .setDescription(emb.embedColor)
          .setMaxLength(32)
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("embed_thumbnail_url").setDescription(emb.embedThumbnailUrl).setMaxLength(2000),
      )
      .addStringOption((opt) =>
        opt.setName("embed_image_url").setDescription(emb.embedImageUrl).setMaxLength(2000),
      )
      .addStringOption((opt) =>
        opt.setName("embed_footer").setDescription(emb.embedFooter).setMaxLength(2048),
      )
      .addStringOption((opt) =>
        opt.setName("embed_footer_icon_url").setDescription(emb.embedFooterIconUrl).setMaxLength(2000),
      )
      .addStringOption((opt) =>
        opt.setName("embed_author_name").setDescription(emb.embedAuthorName).setMaxLength(256),
      )
      .addStringOption((opt) =>
        opt.setName("embed_author_icon_url").setDescription(emb.embedAuthorIconUrl).setMaxLength(2000),
      )
      .addAttachmentOption((opt) =>
        opt.setName("image").setDescription(postTxt.image).setRequired(false),
      ) as unknown as SlashCommandBuilder
  );
}

/**
 * Embed + file options for `/editrolepanel` (Discord max 25 slash options).
 * Omits `embed_footer_icon_url` and `embed_author_icon_url` so six role slots + `single_role` + `image` fit.
 */
function appendEditRolePanelEmbedOptions(cmd: unknown): SlashCommandBuilder {
  const base = cmd as SlashCommandBuilder;
  return (
    base
      .addStringOption((opt) =>
        opt.setName("embed_title").setDescription(emb.embedTitle).setMaxLength(256).setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("embed_description").setDescription(emb.embedDescription).setMaxLength(4000).setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("embed_url").setDescription(emb.embedUrl).setMaxLength(2000).setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("embed_color")
          .setDescription(emb.embedColor)
          .setMaxLength(32)
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("embed_thumbnail_url").setDescription(emb.embedThumbnailUrl).setMaxLength(2000),
      )
      .addStringOption((opt) =>
        opt.setName("embed_image_url").setDescription(emb.embedImageUrl).setMaxLength(2000),
      )
      .addStringOption((opt) =>
        opt.setName("embed_footer").setDescription(emb.embedFooter).setMaxLength(2048),
      )
      .addStringOption((opt) =>
        opt.setName("embed_author_name").setDescription(emb.embedAuthorName).setMaxLength(256),
      )
      .addAttachmentOption((opt) =>
        opt.setName("image").setDescription(postTxt.image).setRequired(false),
      ) as unknown as SlashCommandBuilder
  );
}

const rolePanelCommand = appendSharedPanelEmbedOptions(
  new SlashCommandBuilder()
    .setName("rolepanel")
    .setDescription(rp.commandDescription)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription(rp.channel)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addRoleOption((opt) => opt.setName("role1").setDescription(rp.role(1)).setRequired(true))
    .addStringOption((opt) => opt.setName("label1").setDescription(rp.roleButtonLabel(1)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role2").setDescription(rp.role(2)))
    .addStringOption((opt) => opt.setName("label2").setDescription(rp.roleButtonLabel(2)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role3").setDescription(rp.role(3)))
    .addStringOption((opt) => opt.setName("label3").setDescription(rp.roleButtonLabel(3)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role4").setDescription(rp.role(4)))
    .addStringOption((opt) => opt.setName("label4").setDescription(rp.roleButtonLabel(4)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role5").setDescription(rp.role(5)))
    .addStringOption((opt) => opt.setName("label5").setDescription(rp.roleButtonLabel(5)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role6").setDescription(rp.role(6)))
    .addStringOption((opt) => opt.setName("label6").setDescription(rp.roleButtonLabel(6)).setMaxLength(80))
    .addBooleanOption((opt) =>
      opt
        .setName("single_role")
        .setDescription(rp.singleRole)
        .setRequired(false),
    ),
).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

const LINK_BUTTON_URL_MAX = 512;

const linkPanelCommand = appendSharedPanelEmbedOptions(
  new SlashCommandBuilder()
    .setName("linkpanel")
    .setDescription(lp.commandDescription)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription(lp.channel)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("url1").setDescription(lp.url(1)).setMaxLength(LINK_BUTTON_URL_MAX).setRequired(true),
    )
    .addStringOption((opt) => opt.setName("label1").setDescription(lp.buttonLabel(1)).setMaxLength(80))
    .addStringOption((opt) =>
      opt.setName("url2").setDescription(lp.url(2)).setMaxLength(LINK_BUTTON_URL_MAX),
    )
    .addStringOption((opt) => opt.setName("label2").setDescription(lp.buttonLabel(2)).setMaxLength(80))
    .addStringOption((opt) =>
      opt.setName("url3").setDescription(lp.url(3)).setMaxLength(LINK_BUTTON_URL_MAX),
    )
    .addStringOption((opt) => opt.setName("label3").setDescription(lp.buttonLabel(3)).setMaxLength(80))
    .addStringOption((opt) =>
      opt.setName("url4").setDescription(lp.url(4)).setMaxLength(LINK_BUTTON_URL_MAX),
    )
    .addStringOption((opt) => opt.setName("label4").setDescription(lp.buttonLabel(4)).setMaxLength(80))
    .addStringOption((opt) =>
      opt.setName("url5").setDescription(lp.url(5)).setMaxLength(LINK_BUTTON_URL_MAX),
    )
    .addStringOption((opt) => opt.setName("label5").setDescription(lp.buttonLabel(5)).setMaxLength(80)),
).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const editRolePanelCommand = appendEditRolePanelEmbedOptions(
  new SlashCommandBuilder()
    .setName("editrolepanel")
    .setDescription(erp.commandDescription)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription(erp.channel)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("message_id")
        .setDescription(erp.messageId)
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(22),
    )
    .addRoleOption((opt) => opt.setName("role1").setDescription(erp.role(1)))
    .addStringOption((opt) => opt.setName("label1").setDescription(erp.roleButtonLabel(1)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role2").setDescription(erp.role(2)))
    .addStringOption((opt) => opt.setName("label2").setDescription(erp.roleButtonLabel(2)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role3").setDescription(erp.role(3)))
    .addStringOption((opt) => opt.setName("label3").setDescription(erp.roleButtonLabel(3)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role4").setDescription(erp.role(4)))
    .addStringOption((opt) => opt.setName("label4").setDescription(erp.roleButtonLabel(4)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role5").setDescription(erp.role(5)))
    .addStringOption((opt) => opt.setName("label5").setDescription(erp.roleButtonLabel(5)).setMaxLength(80))
    .addRoleOption((opt) => opt.setName("role6").setDescription(erp.role(6)))
    .addStringOption((opt) => opt.setName("label6").setDescription(erp.roleButtonLabel(6)).setMaxLength(80))
    .addBooleanOption((opt) =>
      opt.setName("single_role").setDescription(erp.singleRole).setRequired(false),
    ),
).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

const editLinkPanelCommand = appendSharedPanelEmbedOptions(
  new SlashCommandBuilder()
    .setName("editlinkpanel")
    .setDescription(elp.commandDescription)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription(elp.channel)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("message_id")
        .setDescription(elp.messageId)
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(22),
    )
    .addStringOption((opt) =>
      opt.setName("url1").setDescription(elp.url(1)).setMaxLength(LINK_BUTTON_URL_MAX),
    )
    .addStringOption((opt) => opt.setName("label1").setDescription(elp.buttonLabel(1)).setMaxLength(80))
    .addStringOption((opt) =>
      opt.setName("url2").setDescription(elp.url(2)).setMaxLength(LINK_BUTTON_URL_MAX),
    )
    .addStringOption((opt) => opt.setName("label2").setDescription(elp.buttonLabel(2)).setMaxLength(80))
    .addStringOption((opt) =>
      opt.setName("url3").setDescription(elp.url(3)).setMaxLength(LINK_BUTTON_URL_MAX),
    )
    .addStringOption((opt) => opt.setName("label3").setDescription(elp.buttonLabel(3)).setMaxLength(80))
    .addStringOption((opt) =>
      opt.setName("url4").setDescription(elp.url(4)).setMaxLength(LINK_BUTTON_URL_MAX),
    )
    .addStringOption((opt) => opt.setName("label4").setDescription(elp.buttonLabel(4)).setMaxLength(80))
    .addStringOption((opt) =>
      opt.setName("url5").setDescription(elp.url(5)).setMaxLength(LINK_BUTTON_URL_MAX),
    )
    .addStringOption((opt) => opt.setName("label5").setDescription(elp.buttonLabel(5)).setMaxLength(80)),
).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const DISCORD_SLASH_MAX_OPTIONS = 25;

function assertSlashOptionCount(cmd: { name: string; toJSON(): { options?: unknown[] } }, commandName: string): void {
  const count = cmd.toJSON().options?.length ?? 0;
  if (count > DISCORD_SLASH_MAX_OPTIONS) {
    throw new Error(
      `Slash command /${commandName} has ${count} options (Discord maximum is ${DISCORD_SLASH_MAX_OPTIONS})`,
    );
  }
}

export async function unregisterGuildCommands(guild: Guild): Promise<void> {
  await guild.commands.set([]);
}

export async function registerGuildCommands(guild: Guild): Promise<void> {
  const commandPayloads = [
    postCommand,
    editCommand,
    rolePanelCommand,
    editRolePanelCommand,
    linkPanelCommand,
    editLinkPanelCommand,
    muteSlashCommand,
    unmuteSlashCommand,
    strikeSlashCommand,
    unstrikeSlashCommand,
    banSlashCommand,
    unbanSlashCommand,
    modstatusSlashCommand,
    voicePanelSlashCommand,
  ];
  for (const cmd of commandPayloads) {
    assertSlashOptionCount(cmd, cmd.name);
  }
  await guild.commands.set(commandPayloads.map((c) => c.toJSON()));
}

function buildButtonsFromInteraction(
  interaction: ChatInputCommandInteraction,
  options?: { singleRole?: boolean },
): DiscordRolePanelButton[] {
  const buttons: DiscordRolePanelButton[] = [];
  const usedRoles = new Set<string>();
  const prefix = options?.singleRole ? ROLE_BUTTON_SINGLE_PREFIX : ROLE_BUTTON_PREFIX;
  for (let i = 1; i <= 6; i++) {
    const role = interaction.options.getRole(`role${i}`);
    if (!role) continue;
    if (usedRoles.has(role.id)) continue;
    usedRoles.add(role.id);
    const labelRaw = interaction.options.getString(`label${i}`)?.trim();
    const label = labelRaw && labelRaw.length > 0 ? labelRaw : role.name;
    buttons.push({ customId: `${prefix}${role.id}`, roleId: role.id, label });
  }
  return buttons;
}

function splitDiscordMessageContent(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    parts.push(rest.slice(0, maxLen));
    rest = rest.slice(maxLen);
  }
  return parts;
}

function collectPostAttachmentRefs(interaction: ChatInputCommandInteraction): PendingAttachmentRef[] {
  const att = interaction.options.getAttachment("image");
  if (!att) return [];
  const name = att.name?.trim();
  return [{ url: att.url, name: name && name.length > 0 ? name : "image.png" }];
}

async function buildDiscordAttachmentBuilders(refs: PendingAttachmentRef[]): Promise<AttachmentBuilder[]> {
  const builders: AttachmentBuilder[] = [];
  for (const ref of refs) {
    const res = await fetch(ref.url);
    if (!res.ok) {
      throw new Error(`Could not download "${ref.name}" (${res.status}).`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    builders.push(new AttachmentBuilder(buf).setName(ref.name));
  }
  return builders;
}

type PanelFirstMessageExtras = {
  embeds?: EmbedBuilder[];
  files?: AttachmentBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
};

async function sendPanelChannelMessages(
  channel: { send: (opts: object) => Promise<{ id: string }> },
  chunks: string[],
  first: PanelFirstMessageExtras,
): Promise<string | undefined> {
  let firstMessageId: string | undefined;
  if (chunks.length === 0) {
    const sent = await channel.send({
      ...(first.embeds?.length ? { embeds: first.embeds } : {}),
      ...(first.files?.length ? { files: first.files } : {}),
      ...(first.components?.length ? { components: first.components } : {}),
    });
    return sent.id;
  }
  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0;
    const sent = await channel.send({
      content: chunks[i],
      ...(isFirst && first.embeds?.length ? { embeds: first.embeds } : {}),
      ...(isFirst && first.files?.length ? { files: first.files } : {}),
      ...(isFirst && first.components?.length ? { components: first.components } : {}),
    });
    if (isFirst) firstMessageId = sent.id;
  }
  return firstMessageId;
}

function buttonsToRows(buttons: DiscordRolePanelButton[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const b of buttons.slice(i, i + 5)) {
      const { remainder, emoji } = peelFirstCustomDiscordEmojiFromLabel(b.label);
      const labelText = remainder.slice(0, DISCORD_BUTTON_LABEL_MAX);
      const btn = new ButtonBuilder().setCustomId(b.customId).setStyle(ButtonStyle.Secondary);
      if (emoji) btn.setEmoji(emoji);
      if (labelText.length > 0) btn.setLabel(labelText);
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

function parseLinkButtonUrl(raw: string | null | undefined): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  const u = parseOptionalHttpUrl(s);
  if (!u || u.length > LINK_BUTTON_URL_MAX) return undefined;
  return u;
}

function defaultLinkButtonLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").slice(0, DISCORD_BUTTON_LABEL_MAX);
  } catch {
    return lp.linkFallbackLabel;
  }
}

type LinkPanelButtonSpec = { url: string; label: string; emoji?: ParsedButtonEmoji };

/** Returns `null` if required `url1` is missing or invalid. */
function buildLinkButtonsFromInteraction(interaction: ChatInputCommandInteraction): LinkPanelButtonSpec[] | null {
  const specs: LinkPanelButtonSpec[] = [];
  for (let i = 1; i <= 5; i++) {
    const url = parseLinkButtonUrl(interaction.options.getString(`url${i}`));
    const labelFromUser = interaction.options.getString(`label${i}`)?.trim();
    if (!url) {
      if (i === 1) return null;
      continue;
    }
    const baseForPeel =
      labelFromUser && labelFromUser.length > 0 ? labelFromUser : defaultLinkButtonLabel(url);
    const { remainder, emoji } = peelFirstCustomDiscordEmojiFromLabel(baseForPeel);
    let label = remainder.trim().slice(0, DISCORD_BUTTON_LABEL_MAX);
    if (label.length === 0 && !emoji) label = defaultLinkButtonLabel(url).slice(0, DISCORD_BUTTON_LABEL_MAX);
    specs.push({ url, label, ...(emoji ? { emoji } : {}) });
  }
  return specs;
}

function resolveEditRolePanelConfig(
  interaction: ChatInputCommandInteraction,
  existing: Message,
  botUserId: string,
): { buttons: DiscordRolePanelButton[]; singleRole: boolean } | null {
  const parsed = parseRolePanelStateFromMessage(existing, botUserId);
  if (!parsed) return null;
  const singleRoleFromSlash = interaction.options.getBoolean("single_role");
  const singleRole = singleRoleFromSlash ?? parsed.singleRole ?? false;
  let buttons = parsed.buttons;
  if (hasRolePanelSlotUpdates(interaction)) {
    buttons = mergeRolePanelButtonsFromInteraction(interaction, buttons, singleRole);
    if (buttons.length === 0) return null;
  } else if (singleRoleFromSlash !== null) {
    buttons = reapplyRolePanelButtonPrefixes(buttons, singleRole);
  }
  return { buttons, singleRole };
}

function resolveEditLinkPanelLinks(
  interaction: ChatInputCommandInteraction,
  existing: Message,
  botUserId: string,
): PendingLinkPanelLink[] | null {
  const existingLinks = parseLinkPanelLinksFromMessage(existing, botUserId);
  if (!existingLinks || existingLinks.length === 0) return existingLinks;
  if (!hasLinkPanelSlotUpdates(interaction)) return existingLinks;
  return mergeLinkPanelLinksFromInteraction(interaction, existingLinks);
}

function linkPanelSpecsToRows(links: readonly LinkPanelButtonSpec[] | PendingLinkPanelPayload["links"]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < links.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const spec of links.slice(i, i + 5)) {
      const btn = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(spec.url);
      if (spec.emoji) btn.setEmoji(spec.emoji);
      if (spec.label.length > 0) btn.setLabel(spec.label);
      else if (!spec.emoji) btn.setLabel(defaultLinkButtonLabel(spec.url));
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

type SlashEmbedOptions = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
  authorName?: string;
  authorIconUrl?: string;
};

function parseOptionalHttpUrl(raw: string | null): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

function parseEmbedColor(raw: string | null): number | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim();
  const hex = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (hex) return parseInt(hex[1], 16);
  const n = Number.parseInt(s, 10);
  if (Number.isFinite(n) && n >= 0 && n <= 0xffffff) return n;
  return undefined;
}

function collectSlashEmbedOptions(interaction: ChatInputCommandInteraction): SlashEmbedOptions {
  return {
    title: interaction.options.getString("embed_title")?.trim() || undefined,
    description: interaction.options.getString("embed_description")?.trim() || undefined,
    url: interaction.options.getString("embed_url")?.trim() || undefined,
    color: parseEmbedColor(interaction.options.getString("embed_color")),
    thumbnailUrl: parseOptionalHttpUrl(interaction.options.getString("embed_thumbnail_url")),
    imageUrl: parseOptionalHttpUrl(interaction.options.getString("embed_image_url")),
    footerText: interaction.options.getString("embed_footer")?.trim() || undefined,
    footerIconUrl: parseOptionalHttpUrl(interaction.options.getString("embed_footer_icon_url")),
    authorName: interaction.options.getString("embed_author_name")?.trim() || undefined,
    authorIconUrl: parseOptionalHttpUrl(interaction.options.getString("embed_author_icon_url")),
  };
}

function slashEmbedOptionsToPendingFields(opts: SlashEmbedOptions): Pick<
  PendingPostPayload,
  | "embedTitle"
  | "embedDescription"
  | "embedUrl"
  | "embedColor"
  | "embedThumbnailUrl"
  | "embedImageUrl"
  | "embedFooter"
  | "embedFooterIconUrl"
  | "embedAuthorName"
  | "embedAuthorIconUrl"
> {
  return {
    embedTitle: opts.title,
    embedDescription: opts.description,
    embedUrl: opts.url,
    embedColor: opts.color,
    embedThumbnailUrl: opts.thumbnailUrl,
    embedImageUrl: opts.imageUrl,
    embedFooter: opts.footerText,
    embedFooterIconUrl: opts.footerIconUrl,
    embedAuthorName: opts.authorName,
    embedAuthorIconUrl: opts.authorIconUrl,
  };
}

function buildEmbedsFromPanelPayload(p: PendingRolePanelPayload | PendingLinkPanelPayload): EmbedBuilder[] | undefined {
  return buildEmbedsFromPending(p as PendingPostPayload);
}

function buildEmbedsFromOptions(opts: SlashEmbedOptions): EmbedBuilder[] | undefined {
  const title = opts.title;
  const description = opts.description;
  const thumb = opts.thumbnailUrl;
  const image = opts.imageUrl;
  const footerText = opts.footerText;
  const footerIcon = opts.footerIconUrl;
  const authorName = opts.authorName;
  const authorIcon = opts.authorIconUrl;
  const hasEmbed =
    Boolean(title) ||
    Boolean(description) ||
    Boolean(thumb) ||
    Boolean(image) ||
    Boolean(footerText || footerIcon) ||
    Boolean(authorName || authorIcon) ||
    opts.color !== undefined;
  if (!hasEmbed) return undefined;
  const embed = new EmbedBuilder();
  if (title) embed.setTitle(title.slice(0, 256));
  if (description) embed.setDescription(description.slice(0, 4096));
  if (opts.url) {
    try {
      new URL(opts.url);
      embed.setURL(opts.url);
    } catch {
      /* invalid URL */
    }
  }
  if (opts.color !== undefined) embed.setColor(opts.color);
  if (thumb) embed.setThumbnail(thumb);
  if (image) embed.setImage(image);
  if (footerText || footerIcon) {
    embed.setFooter({
      text: (footerText ?? "\u200b").slice(0, 2048),
      iconURL: footerIcon,
    });
  }
  if (authorName || authorIcon) {
    embed.setAuthor({
      name: (authorName ?? "\u200b").slice(0, 256),
      iconURL: authorIcon,
    });
  }
  return [embed];
}

function buildEmbedsFromPending(p: PendingPostPayload): EmbedBuilder[] | undefined {
  return buildEmbedsFromOptions({
    title: p.embedTitle,
    description: p.embedDescription,
    url: p.embedUrl,
    color: p.embedColor,
    thumbnailUrl: p.embedThumbnailUrl,
    imageUrl: p.embedImageUrl,
    footerText: p.embedFooter,
    footerIconUrl: p.embedFooterIconUrl,
    authorName: p.embedAuthorName,
    authorIconUrl: p.embedAuthorIconUrl,
  });
}

function extractBaselineEmbedFromMessage(message: Message): PendingEditBaselineEmbed | undefined {
  const e = message.embeds[0];
  if (!e) return undefined;
  return {
    embedTitle: e.title ?? undefined,
    embedDescription: e.description ?? undefined,
    embedUrl: e.url ?? undefined,
    embedColor: e.color ?? undefined,
    embedThumbnailUrl: e.thumbnail?.url ?? undefined,
    embedImageUrl: e.image?.url ?? undefined,
    embedFooter: e.footer?.text ?? undefined,
    embedFooterIconUrl: e.footer?.iconURL ?? undefined,
    embedAuthorName: e.author?.name ?? undefined,
    embedAuthorIconUrl: e.author?.iconURL ?? undefined,
  };
}

function mergeEditEmbedFields(baseline: PendingEditBaselineEmbed | undefined, pending: PendingEditPayload): SlashEmbedOptions {
  return {
    title: pending.embedTitle ?? baseline?.embedTitle,
    description: pending.embedDescription ?? baseline?.embedDescription,
    url: pending.embedUrl ?? baseline?.embedUrl,
    color: pending.embedColor ?? baseline?.embedColor,
    thumbnailUrl: pending.embedThumbnailUrl ?? baseline?.embedThumbnailUrl,
    imageUrl: pending.embedImageUrl ?? baseline?.embedImageUrl,
    footerText: pending.embedFooter ?? baseline?.embedFooter,
    footerIconUrl: pending.embedFooterIconUrl ?? baseline?.embedFooterIconUrl,
    authorName: pending.embedAuthorName ?? baseline?.embedAuthorName,
    authorIconUrl: pending.embedAuthorIconUrl ?? baseline?.embedAuthorIconUrl,
  };
}

async function handlePost(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelRef = interaction.options.getChannel("channel", true);
  const channel = await interaction.guild!.channels.fetch(channelRef.id);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    await interaction.reply({ content: com.channelNotText, flags: MessageFlags.Ephemeral });
    return;
  }
  const attachments = collectPostAttachmentRefs(interaction);
  const embedOpts = collectSlashEmbedOptions(interaction);
  const nonce = createPendingPost({
    guildId: interaction.guildId!,
    channelId: channel.id,
    userId: interaction.user.id,
    attachments: attachments.length > 0 ? attachments : undefined,
    embedTitle: embedOpts.title,
    embedDescription: embedOpts.description,
    embedUrl: embedOpts.url,
    embedColor: embedOpts.color,
    embedThumbnailUrl: embedOpts.thumbnailUrl,
    embedImageUrl: embedOpts.imageUrl,
    embedFooter: embedOpts.footerText,
    embedFooterIconUrl: embedOpts.footerIconUrl,
    embedAuthorName: embedOpts.authorName,
    embedAuthorIconUrl: embedOpts.authorIconUrl,
  });
  const modal = new ModalBuilder().setCustomId(`post:${nonce}`).setTitle(postTxt.modalTitle);
  const bodyRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId("content")
      .setLabel(postTxt.modalBodyLabel.slice(0, DISCORD_TEXT_INPUT_LABEL_MAX))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMinLength(0)
      .setMaxLength(4000),
  );
  modal.addComponents(bodyRow);
  await interaction.showModal(modal);
}

async function handlePostModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const nonce = interaction.customId.slice("post:".length);
  const pending = takePendingPost(nonce);
  if (!pending) {
    await interaction.reply({
      content: com.modalStalePost,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.inGuild() || interaction.guildId !== pending.guildId) {
    await interaction.reply({ content: com.wrongGuild, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({ content: com.modalWrongInvokerPost, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!isDiscordAdmin(interaction.member)) {
    await interaction.reply({ content: com.noPermission, flags: MessageFlags.Ephemeral });
    return;
  }
  const raw = interaction.fields.getTextInputValue("content").replace(/\r\n/g, "\n");
  const contentTrimmed = raw.trim();
  const attachmentRefs = pending.attachments ?? [];
  const hasAttachments = attachmentRefs.length > 0;
  const embedsFirst = buildEmbedsFromPending(pending);
  const hasEmbed = !!embedsFirst?.length;

  if (!contentTrimmed && !hasAttachments && !hasEmbed) {
    await interaction.reply({
      content: com.postModalNeedsContent,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = await interaction.guild!.channels.fetch(pending.channelId);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    await interaction.editReply({ content: com.channelUnavailable });
    return;
  }
  let fileBuilders: AttachmentBuilder[] = [];
  try {
    if (hasAttachments) {
      fileBuilders = await buildDiscordAttachmentBuilders(attachmentRefs);
    }
  } catch (err) {
    console.error("/post attachment download failed:", err);
    await interaction.editReply({
      content: discordFmtAttachmentPrepFail(err),
    });
    return;
  }

  const chunks = contentTrimmed
    ? splitDiscordMessageContent(contentTrimmed, DISCORD_MESSAGE_CONTENT_MAX)
    : [];
  let firstMessageId: string | undefined;
  const totalParts = chunks.length > 0 ? chunks.length : 1;

  try {
    if (chunks.length === 0) {
      const sent = await channel.send({
        ...(embedsFirst?.length ? { embeds: embedsFirst } : {}),
        ...(fileBuilders.length > 0 ? { files: fileBuilders } : {}),
      });
      firstMessageId = sent.id;
    } else {
      for (let i = 0; i < chunks.length; i++) {
        const isFirst = i === 0;
        const sent = await channel.send({
          content: chunks[i],
          ...(isFirst && embedsFirst?.length ? { embeds: embedsFirst } : {}),
          ...(isFirst && fileBuilders.length > 0 ? { files: fileBuilders } : {}),
        });
        if (isFirst) firstMessageId = sent.id;
      }
    }
  } catch (err) {
    console.error("/post channel.send failed:", err);
    await interaction.editReply({
      content: discordFmtChannelSendFail(err),
    });
    return;
  }

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(
      `[Discord /post modal] by user=${interaction.user.id} channel=${pending.channelId} firstMessage=${firstMessageId ?? "?"} textParts=${chunks.length} attachments=${attachmentRefs.length} embed=${hasEmbed}`,
    );
  }
  await interaction.editReply({
    content: discordFmtPostPublished({
      channelId: pending.channelId,
      totalParts,
      attachmentCount: attachmentRefs.length,
      hasEmbed,
    }),
  });
}

async function handleEdit(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawId = interaction.options.getString("message_id", true).trim();
  if (!isDiscordSnowflake(rawId)) {
    await interaction.reply({ content: editTxt.invalidMessageId, flags: MessageFlags.Ephemeral });
    return;
  }
  const channelRef = interaction.options.getChannel("channel", true);
  const channel = await interaction.guild!.channels.fetch(channelRef.id);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.reply({ content: com.channelNotText, flags: MessageFlags.Ephemeral });
    return;
  }
  let existing: Message;
  try {
    existing = await channel.messages.fetch(rawId);
    if (existing.author.id !== interaction.client.user!.id) {
      await interaction.reply({ content: editTxt.notBotsMessage, flags: MessageFlags.Ephemeral });
      return;
    }
  } catch {
    await interaction.reply({ content: editTxt.messageNotFound, flags: MessageFlags.Ephemeral });
    return;
  }
  const baselineEmbed = extractBaselineEmbedFromMessage(existing);
  const attachments = collectPostAttachmentRefs(interaction);
  const embedOpts = collectSlashEmbedOptions(interaction);
  const nonce = createPendingEdit({
    guildId: interaction.guildId!,
    channelId: channel.id,
    messageId: rawId,
    userId: interaction.user.id,
    attachments: attachments.length > 0 ? attachments : undefined,
    baselineEmbed,
    embedTitle: embedOpts.title,
    embedDescription: embedOpts.description,
    embedUrl: embedOpts.url,
    embedColor: embedOpts.color,
    embedThumbnailUrl: embedOpts.thumbnailUrl,
    embedImageUrl: embedOpts.imageUrl,
    embedFooter: embedOpts.footerText,
    embedFooterIconUrl: embedOpts.footerIconUrl,
    embedAuthorName: embedOpts.authorName,
    embedAuthorIconUrl: embedOpts.authorIconUrl,
  });
  const bodyInput = new TextInputBuilder()
    .setCustomId("content")
    .setLabel(editTxt.modalBodyLabel.slice(0, DISCORD_TEXT_INPUT_LABEL_MAX))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMinLength(0)
    .setMaxLength(4000);
  const initialBody = existing.content ?? "";
  if (initialBody.length > 0) {
    bodyInput.setValue(initialBody.slice(0, 4000));
  }
  const modal = new ModalBuilder().setCustomId(`edit:${nonce}`).setTitle(editTxt.modalTitle);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(bodyInput));
  await interaction.showModal(modal);
}

async function handleEditModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const nonce = interaction.customId.slice("edit:".length);
  const pending = takePendingEdit(nonce);
  if (!pending) {
    await interaction.reply({
      content: com.modalStaleEdit,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.inGuild() || interaction.guildId !== pending.guildId) {
    await interaction.reply({ content: com.wrongGuild, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({ content: com.modalWrongInvokerEdit, flags: MessageFlags.Ephemeral });
    return;
  }
  if (!isDiscordAdmin(interaction.member)) {
    await interaction.reply({ content: com.noPermission, flags: MessageFlags.Ephemeral });
    return;
  }
  const raw = interaction.fields.getTextInputValue("content").replace(/\r\n/g, "\n");
  const contentTrimmed = raw.trim();
  const attachmentRefs = pending.attachments ?? [];
  const hasAttachments = attachmentRefs.length > 0;
  const mergedEmbedOpts = mergeEditEmbedFields(pending.baselineEmbed, pending);
  const embedsFirst = buildEmbedsFromOptions(mergedEmbedOpts);
  const hasEmbed = !!embedsFirst?.length;

  if (!contentTrimmed && !hasAttachments && !hasEmbed) {
    await interaction.reply({
      content: com.postModalNeedsContent,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (contentTrimmed.length > DISCORD_MESSAGE_CONTENT_MAX) {
    await interaction.reply({ content: editTxt.bodyTooLong, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = await interaction.guild!.channels.fetch(pending.channelId);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.editReply({ content: com.channelUnavailable });
    return;
  }

  let msg;
  try {
    msg = await channel.messages.fetch(pending.messageId);
  } catch {
    await interaction.editReply({ content: editTxt.messageNotFound });
    return;
  }
  if (msg.author.id !== interaction.client.user!.id) {
    await interaction.editReply({ content: editTxt.notBotsMessage });
    return;
  }

  let fileBuilders: AttachmentBuilder[] = [];
  try {
    if (hasAttachments) {
      fileBuilders = await buildDiscordAttachmentBuilders(attachmentRefs);
    }
  } catch (err) {
    console.error("/edit attachment download failed:", err);
    await interaction.editReply({
      content: discordFmtAttachmentPrepFail(err),
    });
    return;
  }

  try {
    await msg.edit({
      content: contentTrimmed.length > 0 ? contentTrimmed : null,
      embeds: hasEmbed ? embedsFirst! : [],
      ...(hasAttachments && fileBuilders.length > 0 ? { files: fileBuilders } : {}),
    });
  } catch (err) {
    console.error("/edit message.edit failed:", err);
    await interaction.editReply({
      content: discordFmtChannelSendFail(err),
    });
    return;
  }

  await interaction.editReply({
    content: discordFmtEditDone(interaction.guild!.id, pending.channelId, pending.messageId),
  });
}

async function fetchBotPanelMessage(
  interaction: ChatInputCommandInteraction,
  channel: { messages: { fetch: (id: string) => Promise<Message> } },
  messageId: string,
): Promise<Message | null> {
  try {
    const msg = await channel.messages.fetch(messageId);
    if (msg.author.id !== interaction.client.user!.id) return null;
    return msg;
  } catch {
    return null;
  }
}

async function handleEditRolePanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawId = interaction.options.getString("message_id", true).trim();
  if (!isDiscordSnowflake(rawId)) {
    await interaction.reply({ content: editTxt.invalidMessageId, flags: MessageFlags.Ephemeral });
    return;
  }
  const channelRef = interaction.options.getChannel("channel", true);
  const channel = await interaction.guild!.channels.fetch(channelRef.id);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.reply({ content: com.channelNotText, flags: MessageFlags.Ephemeral });
    return;
  }
  if (DISCORD_ROLE_PANEL_CHANNEL_ID && channel.id !== DISCORD_ROLE_PANEL_CHANNEL_ID) {
    await interaction.reply({
      content: discordFmtRolePanelWrongChannel(DISCORD_ROLE_PANEL_CHANNEL_ID),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const botId = interaction.client.user!.id;
  const existing = await fetchBotPanelMessage(interaction, channel, rawId);
  if (!existing) {
    await interaction.reply({ content: editTxt.messageNotFound, flags: MessageFlags.Ephemeral });
    return;
  }
  const resolved = resolveEditRolePanelConfig(interaction, existing, botId);
  if (!resolved) {
    await interaction.reply({ content: erp.notRolePanel, flags: MessageFlags.Ephemeral });
    return;
  }
  const baselineEmbed = extractBaselineEmbedFromMessage(existing);
  const attachments = collectPostAttachmentRefs(interaction);
  const embedOpts = collectSlashEmbedOptions(interaction);
  const nonce = createPendingEditRolePanel({
    guildId: interaction.guildId!,
    channelId: channel.id,
    messageId: rawId,
    userId: interaction.user.id,
    buttons: resolved.buttons,
    singleRole: resolved.singleRole,
    attachments: attachments.length > 0 ? attachments : undefined,
    baselineEmbed,
    ...slashEmbedOptionsToPendingFields(embedOpts),
  });
  const bodyInput = new TextInputBuilder()
    .setCustomId("content")
    .setLabel(erp.modalBodyLabel.slice(0, DISCORD_TEXT_INPUT_LABEL_MAX))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMinLength(0)
    .setMaxLength(4000);
  const initialBody = existing.content ?? "";
  if (initialBody.length > 0) {
    bodyInput.setValue(initialBody.slice(0, 4000));
  }
  const modal = new ModalBuilder().setCustomId(`editrolepanel:${nonce}`).setTitle(erp.modalTitle);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(bodyInput));
  await interaction.showModal(modal);
}

async function handleEditRolePanelModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const nonce = interaction.customId.slice("editrolepanel:".length);
  const pending = takePendingEditRolePanel(nonce);
  if (!pending) {
    await interaction.reply({
      content: com.modalStaleEditRolePanel,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.inGuild() || interaction.guildId !== pending.guildId) {
    await interaction.reply({ content: com.wrongGuild, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({
      content: com.modalWrongInvokerEditRolePanel,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!isDiscordAdmin(interaction.member)) {
    await interaction.reply({ content: com.noPermission, flags: MessageFlags.Ephemeral });
    return;
  }
  const raw = interaction.fields.getTextInputValue("content").replace(/\r\n/g, "\n");
  const contentTrimmed = raw.trim();
  const attachmentRefs = pending.attachments ?? [];
  const hasAttachments = attachmentRefs.length > 0;
  const mergedEmbedOpts = mergeEditEmbedFields(pending.baselineEmbed, pending);
  const embedsFirst = buildEmbedsFromOptions(mergedEmbedOpts);
  const hasEmbed = !!embedsFirst?.length;
  if (!contentTrimmed && !hasAttachments && !hasEmbed) {
    await interaction.reply({
      content: com.panelModalNeedsContent,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (contentTrimmed.length > DISCORD_MESSAGE_CONTENT_MAX) {
    await interaction.reply({ content: editTxt.bodyTooLong, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = await interaction.guild!.channels.fetch(pending.channelId);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.editReply({ content: com.channelUnavailable });
    return;
  }

  let msg: Message;
  try {
    msg = await channel.messages.fetch(pending.messageId);
  } catch {
    await interaction.editReply({ content: editTxt.messageNotFound });
    return;
  }
  if (msg.author.id !== interaction.client.user!.id) {
    await interaction.editReply({ content: editTxt.notBotsMessage });
    return;
  }

  let fileBuilders: AttachmentBuilder[] = [];
  try {
    if (hasAttachments) {
      fileBuilders = await buildDiscordAttachmentBuilders(attachmentRefs);
    }
  } catch (err) {
    console.error("/editrolepanel attachment download failed:", err);
    await interaction.editReply({
      content: discordFmtAttachmentPrepFail(err),
    });
    return;
  }

  try {
    await msg.edit({
      content: contentTrimmed.length > 0 ? contentTrimmed : null,
      embeds: hasEmbed ? embedsFirst! : [],
      components: buttonsToRows(pending.buttons),
      ...(hasAttachments && fileBuilders.length > 0 ? { files: fileBuilders } : {}),
    });
    setDiscordRolePanel({
      guildId: interaction.guildId!,
      channelId: pending.channelId,
      messageId: pending.messageId,
      buttons: pending.buttons,
      singleRole: pending.singleRole ?? false,
    });
    await saveState(LAST_SEEN_STATE_FILE);
  } catch (err) {
    console.error("/editrolepanel message.edit failed:", err);
    await interaction.editReply({
      content: discordFmtChannelSendFail(err),
    });
    return;
  }

  await interaction.editReply({
    content: discordFmtEditDone(interaction.guild!.id, pending.channelId, pending.messageId),
  });
}

async function handleEditLinkPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const rawId = interaction.options.getString("message_id", true).trim();
  if (!isDiscordSnowflake(rawId)) {
    await interaction.reply({ content: editTxt.invalidMessageId, flags: MessageFlags.Ephemeral });
    return;
  }
  const channelRef = interaction.options.getChannel("channel", true);
  const channel = await interaction.guild!.channels.fetch(channelRef.id);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.reply({ content: com.channelNotText, flags: MessageFlags.Ephemeral });
    return;
  }
  const botId = interaction.client.user!.id;
  const existing = await fetchBotPanelMessage(interaction, channel, rawId);
  if (!existing) {
    await interaction.reply({ content: editTxt.messageNotFound, flags: MessageFlags.Ephemeral });
    return;
  }
  const links = resolveEditLinkPanelLinks(interaction, existing, botId);
  if (links === null) {
    await interaction.reply({
      content: linkErr.urlInvalid,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!links || links.length === 0) {
    await interaction.reply({ content: elp.notLinkPanel, flags: MessageFlags.Ephemeral });
    return;
  }
  const baselineEmbed = extractBaselineEmbedFromMessage(existing);
  const attachments = collectPostAttachmentRefs(interaction);
  const embedOpts = collectSlashEmbedOptions(interaction);
  const nonce = createPendingEditLinkPanel({
    guildId: interaction.guildId!,
    channelId: channel.id,
    messageId: rawId,
    userId: interaction.user.id,
    links,
    attachments: attachments.length > 0 ? attachments : undefined,
    baselineEmbed,
    ...slashEmbedOptionsToPendingFields(embedOpts),
  });
  const bodyInput = new TextInputBuilder()
    .setCustomId("content")
    .setLabel(elp.modalBodyLabel.slice(0, DISCORD_TEXT_INPUT_LABEL_MAX))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMinLength(0)
    .setMaxLength(4000);
  const initialBody = existing.content ?? "";
  if (initialBody.length > 0) {
    bodyInput.setValue(initialBody.slice(0, 4000));
  }
  const modal = new ModalBuilder().setCustomId(`editlinkpanel:${nonce}`).setTitle(elp.modalTitle);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(bodyInput));
  await interaction.showModal(modal);
}

async function handleEditLinkPanelModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const nonce = interaction.customId.slice("editlinkpanel:".length);
  const pending = takePendingEditLinkPanel(nonce);
  if (!pending) {
    await interaction.reply({
      content: com.modalStaleEditLinkPanel,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.inGuild() || interaction.guildId !== pending.guildId) {
    await interaction.reply({ content: com.wrongGuild, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({
      content: com.modalWrongInvokerEditLinkPanel,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!isDiscordAdmin(interaction.member)) {
    await interaction.reply({ content: com.noPermission, flags: MessageFlags.Ephemeral });
    return;
  }
  const raw = interaction.fields.getTextInputValue("content").replace(/\r\n/g, "\n");
  const contentTrimmed = raw.trim();
  const attachmentRefs = pending.attachments ?? [];
  const hasAttachments = attachmentRefs.length > 0;
  const mergedEmbedOpts = mergeEditEmbedFields(pending.baselineEmbed, pending);
  const embedsFirst = buildEmbedsFromOptions(mergedEmbedOpts);
  const hasEmbed = !!embedsFirst?.length;
  if (!contentTrimmed && !hasAttachments && !hasEmbed) {
    await interaction.reply({
      content: com.panelModalNeedsContent,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (contentTrimmed.length > DISCORD_MESSAGE_CONTENT_MAX) {
    await interaction.reply({ content: editTxt.bodyTooLong, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = await interaction.guild!.channels.fetch(pending.channelId);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.editReply({ content: com.channelUnavailable });
    return;
  }

  let msg: Message;
  try {
    msg = await channel.messages.fetch(pending.messageId);
  } catch {
    await interaction.editReply({ content: editTxt.messageNotFound });
    return;
  }
  if (msg.author.id !== interaction.client.user!.id) {
    await interaction.editReply({ content: editTxt.notBotsMessage });
    return;
  }

  let fileBuilders: AttachmentBuilder[] = [];
  try {
    if (hasAttachments) {
      fileBuilders = await buildDiscordAttachmentBuilders(attachmentRefs);
    }
  } catch (err) {
    console.error("/editlinkpanel attachment download failed:", err);
    await interaction.editReply({
      content: discordFmtAttachmentPrepFail(err),
    });
    return;
  }

  try {
    await msg.edit({
      content: contentTrimmed.length > 0 ? contentTrimmed : null,
      embeds: hasEmbed ? embedsFirst! : [],
      components: linkPanelSpecsToRows(pending.links),
      ...(hasAttachments && fileBuilders.length > 0 ? { files: fileBuilders } : {}),
    });
  } catch (err) {
    console.error("/editlinkpanel message.edit failed:", err);
    await interaction.editReply({
      content: discordFmtChannelSendFail(err),
    });
    return;
  }

  await interaction.editReply({
    content: discordFmtEditDone(interaction.guild!.id, pending.channelId, pending.messageId),
  });
}

export async function handleDiscordModal(interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId;
  if (id.startsWith("post:")) {
    await handlePostModalSubmit(interaction);
    return;
  }
  if (id.startsWith("edit:")) {
    await handleEditModalSubmit(interaction);
    return;
  }
  if (id.startsWith("rolepanel:")) {
    await handleRolePanelModalSubmit(interaction);
    return;
  }
  if (id.startsWith("linkpanel:")) {
    await handleLinkPanelModalSubmit(interaction);
    return;
  }
  if (id.startsWith("editrolepanel:")) {
    await handleEditRolePanelModalSubmit(interaction);
    return;
  }
  if (id.startsWith("editlinkpanel:")) {
    await handleEditLinkPanelModalSubmit(interaction);
  }
}

async function handleRolePanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelRef = interaction.options.getChannel("channel", true);
  const channel = await interaction.guild!.channels.fetch(channelRef.id);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    await interaction.reply({ content: com.channelNotText, flags: MessageFlags.Ephemeral });
    return;
  }
  if (DISCORD_ROLE_PANEL_CHANNEL_ID && channel.id !== DISCORD_ROLE_PANEL_CHANNEL_ID) {
    await interaction.reply({
      content: discordFmtRolePanelWrongChannel(DISCORD_ROLE_PANEL_CHANNEL_ID),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const singleRole = interaction.options.getBoolean("single_role") ?? false;
  const buttons = buildButtonsFromInteraction(interaction, { singleRole });
  if (buttons.length === 0) {
    await interaction.reply({ content: roleErr.needOneRole, flags: MessageFlags.Ephemeral });
    return;
  }
  const attachments = collectPostAttachmentRefs(interaction);
  const embedOpts = collectSlashEmbedOptions(interaction);
  const nonce = createPendingRolePanel({
    guildId: interaction.guildId!,
    channelId: channel.id,
    userId: interaction.user.id,
    buttons,
    singleRole,
    attachments: attachments.length > 0 ? attachments : undefined,
    ...slashEmbedOptionsToPendingFields(embedOpts),
  });
  const modal = new ModalBuilder().setCustomId(`rolepanel:${nonce}`).setTitle(rp.modalTitle);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("content")
        .setLabel(rp.modalBodyLabel.slice(0, DISCORD_TEXT_INPUT_LABEL_MAX))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMinLength(0)
        .setMaxLength(4000),
    ),
  );
  await interaction.showModal(modal);
}

async function handleRolePanelModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const nonce = interaction.customId.slice("rolepanel:".length);
  const pending = takePendingRolePanel(nonce);
  if (!pending) {
    await interaction.reply({
      content: com.modalStaleRolePanel,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.inGuild() || interaction.guildId !== pending.guildId) {
    await interaction.reply({ content: com.wrongGuild, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({
      content: com.modalWrongInvokerRolePanel,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!isDiscordAdmin(interaction.member)) {
    await interaction.reply({ content: com.noPermission, flags: MessageFlags.Ephemeral });
    return;
  }
  const raw = interaction.fields.getTextInputValue("content").replace(/\r\n/g, "\n");
  const contentTrimmed = raw.trim();
  const attachmentRefs = pending.attachments ?? [];
  const hasAttachments = attachmentRefs.length > 0;
  const embedsFirst = buildEmbedsFromPanelPayload(pending);
  const hasEmbed = !!embedsFirst?.length;
  if (!contentTrimmed && !hasAttachments && !hasEmbed) {
    await interaction.reply({
      content: com.panelModalNeedsContent,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = await interaction.guild!.channels.fetch(pending.channelId);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    await interaction.editReply({ content: com.channelUnavailable });
    return;
  }

  let fileBuilders: AttachmentBuilder[] = [];
  try {
    if (hasAttachments) {
      fileBuilders = await buildDiscordAttachmentBuilders(attachmentRefs);
    }
  } catch (err) {
    console.error("/rolepanel attachment download failed:", err);
    await interaction.editReply({
      content: discordFmtAttachmentPrepFail(err),
    });
    return;
  }

  const chunks = contentTrimmed ? splitDiscordMessageContent(contentTrimmed, DISCORD_MESSAGE_CONTENT_MAX) : [];

  try {
    const firstMessageId = await sendPanelChannelMessages(channel, chunks, {
      embeds: embedsFirst,
      files: fileBuilders,
      components: buttonsToRows(pending.buttons),
    });
    if (firstMessageId) {
      setDiscordRolePanel({
        guildId: interaction.guildId!,
        channelId: pending.channelId,
        messageId: firstMessageId,
        buttons: pending.buttons,
        singleRole: pending.singleRole ?? false,
      });
    }
    await saveState(LAST_SEEN_STATE_FILE);
  } catch (err) {
    console.error("/rolepanel modal channel.send failed:", err);
    await interaction.editReply({
      content: discordFmtChannelSendFail(err),
    });
    return;
  }

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(
      `[Discord /rolepanel modal] by user=${interaction.user.id} channel=${pending.channelId} buttons=${pending.buttons.length} embed=${hasEmbed} attachments=${attachmentRefs.length} textChunks=${Math.max(1, chunks.length)}`,
    );
  }
  await interaction.editReply({
    content: discordFmtRolePanelCreated(pending.channelId, pending.buttons.length),
  });
}

export async function handleDiscordCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: com.guildOnlyCommand, flags: MessageFlags.Ephemeral });
    return;
  }

  if (
    interaction.commandName === "mute" ||
    interaction.commandName === "unmute" ||
    interaction.commandName === "strike" ||
    interaction.commandName === "unstrike" ||
    interaction.commandName === "ban" ||
    interaction.commandName === "unban" ||
    interaction.commandName === "modstatus"
  ) {
    await handleModerationSlashCommand(interaction);
    return;
  }

  if (!isDiscordAdmin(interaction.member)) {
    await interaction.reply({ content: com.noPermission, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.commandName === "post") {
    await handlePost(interaction);
    return;
  }
  if (interaction.commandName === "edit") {
    await handleEdit(interaction);
    return;
  }
  if (interaction.commandName === "rolepanel") {
    await handleRolePanel(interaction);
    return;
  }
  if (interaction.commandName === "linkpanel") {
    await handleLinkPanel(interaction);
    return;
  }
  if (interaction.commandName === "editrolepanel") {
    await handleEditRolePanel(interaction);
    return;
  }
  if (interaction.commandName === "editlinkpanel") {
    await handleEditLinkPanel(interaction);
    return;
  }
  if (interaction.commandName === "voicepanel") {
    await handleVoicePanelCommand(interaction);
  }
}

async function handleLinkPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelRef = interaction.options.getChannel("channel", true);
  const channel = await interaction.guild!.channels.fetch(channelRef.id);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    await interaction.reply({ content: com.channelNotText, flags: MessageFlags.Ephemeral });
    return;
  }
  const links = buildLinkButtonsFromInteraction(interaction);
  if (links === null) {
    await interaction.reply({
      content: linkErr.url1Invalid,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (links.length === 0) {
    await interaction.reply({ content: linkErr.needOneLink, flags: MessageFlags.Ephemeral });
    return;
  }
  const attachments = collectPostAttachmentRefs(interaction);
  const embedOpts = collectSlashEmbedOptions(interaction);
  const nonce = createPendingLinkPanel({
    guildId: interaction.guildId!,
    channelId: channel.id,
    userId: interaction.user.id,
    links,
    attachments: attachments.length > 0 ? attachments : undefined,
    ...slashEmbedOptionsToPendingFields(embedOpts),
  });
  const modal = new ModalBuilder().setCustomId(`linkpanel:${nonce}`).setTitle(lp.modalTitle);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("content")
        .setLabel(lp.modalBodyLabel.slice(0, DISCORD_TEXT_INPUT_LABEL_MAX))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMinLength(0)
        .setMaxLength(4000),
    ),
  );
  await interaction.showModal(modal);
}

async function handleLinkPanelModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const nonce = interaction.customId.slice("linkpanel:".length);
  const pending = takePendingLinkPanel(nonce);
  if (!pending) {
    await interaction.reply({
      content: com.modalStaleLinkPanel,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.inGuild() || interaction.guildId !== pending.guildId) {
    await interaction.reply({ content: com.wrongGuild, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({
      content: com.modalWrongInvokerLinkPanel,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!isDiscordAdmin(interaction.member)) {
    await interaction.reply({ content: com.noPermission, flags: MessageFlags.Ephemeral });
    return;
  }
  const raw = interaction.fields.getTextInputValue("content").replace(/\r\n/g, "\n");
  const contentTrimmed = raw.trim();
  const attachmentRefs = pending.attachments ?? [];
  const hasAttachments = attachmentRefs.length > 0;
  const embedsFirst = buildEmbedsFromPanelPayload(pending);
  const hasEmbed = !!embedsFirst?.length;
  if (!contentTrimmed && !hasAttachments && !hasEmbed) {
    await interaction.reply({
      content: com.panelModalNeedsContent,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = await interaction.guild!.channels.fetch(pending.channelId);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    await interaction.editReply({ content: com.channelUnavailable });
    return;
  }

  let fileBuilders: AttachmentBuilder[] = [];
  try {
    if (hasAttachments) {
      fileBuilders = await buildDiscordAttachmentBuilders(attachmentRefs);
    }
  } catch (err) {
    console.error("/linkpanel attachment download failed:", err);
    await interaction.editReply({
      content: discordFmtAttachmentPrepFail(err),
    });
    return;
  }

  const chunks = contentTrimmed ? splitDiscordMessageContent(contentTrimmed, DISCORD_MESSAGE_CONTENT_MAX) : [];
  const linkRows = linkPanelSpecsToRows(pending.links);

  try {
    await sendPanelChannelMessages(channel, chunks, {
      embeds: embedsFirst,
      files: fileBuilders,
      components: linkRows,
    });
  } catch (err) {
    console.error("/linkpanel modal channel.send failed:", err);
    await interaction.editReply({
      content: discordFmtChannelSendFail(err),
    });
    return;
  }

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(
      `[Discord /linkpanel modal] by user=${interaction.user.id} channel=${pending.channelId} links=${pending.links.length} embed=${hasEmbed} attachments=${attachmentRefs.length} textChunks=${Math.max(1, chunks.length)}`,
    );
  }
  await interaction.editReply({
    content: discordFmtLinkPanelDone(pending.channelId, pending.links.length),
  });
}
