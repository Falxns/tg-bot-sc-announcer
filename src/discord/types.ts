export type DiscordRolePanelButton = {
  customId: string;
  roleId: string;
  label: string;
};

export type DiscordRolePanelState = {
  guildId: string;
  channelId: string;
  messageId: string;
  buttons: DiscordRolePanelButton[];
  singleRole?: boolean;
};

export type TempVoiceRoomState = {
  guildId: string;
  voiceChannelId: string;
  ownerId: string;
  textChannelId?: string;
  locked: boolean;
  userLimit?: number;
  rtcRegion?: string | null;
  createdAt: number;
};

export type TempVoicePanelState = {
  guildId: string;
  channelId: string;
  messageId: string;
};

export type ViolationSeverity = "minor" | "major";

export type DiscordChannelPolicy = {
  blockInviteLinks?: boolean;
  allowInviteRoleIds?: string[];
  /** When true, Discord invite links are not auto-moderated in this channel. */
  allowDiscordInvites?: boolean;
  /** Severity when invite rule fires (default major). */
  inviteViolationSeverity?: ViolationSeverity;
  blockVideos?: boolean;
  blockImages?: boolean;
  blockText?: boolean;
  blockedKeywords?: string[];
  /** Severity for keyword hits (default minor). */
  keywordViolationSeverity?: ViolationSeverity;
  /** Severity for blockVideos / blockImages / blockText (default minor). */
  mediaViolationSeverity?: ViolationSeverity;
  /** Channel-purpose preset id for automod media/text hits (e.g. "vidos"). */
  channelPresetId?: string;
  /** Optional server rule preset id for automod hits in this channel (e.g. "rule_spam"). */
  rulePresetId?: string;
};

export type DiscordChannelPolicyMap = Record<string, DiscordChannelPolicy>;
