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

export type ClanRulesPanelState = {
  messageId: string;
  guildId: string;
  channelId: string;
  rulesParentMessageId?: string;
};

export type ClanGrantRequestType = "grant" | "remove";

export type ClanGrantRequest = {
  id: string;
  guildId: string;
  channelId: string;
  threadId?: string;
  clanRoleId: string;
  clanRoleName: string;
  targetUserId: string;
  requesterUserId: string;
  type: ClanGrantRequestType;
  grantLeaderMeta: boolean;
  status: "pending" | "approved" | "denied";
  pendingMessageId?: string;
  /** Original command message in the rules thread — notified on resolve. */
  sourceMessageId?: string;
  createdAt: number;
};

export type ClanLeaderMetaRequestStatus = "pending_clan_leader" | "pending_mod" | "approved" | "denied";

export type ClanLeaderMetaRequest = {
  id: string;
  guildId: string;
  clanRoleId: string;
  clanRoleName: string;
  targetUserId: string;
  requesterUserId: string;
  status: ClanLeaderMetaRequestStatus;
  threadId: string;
  channelId: string;
  pendingMessageId?: string;
  /** Original command message in the rules thread — notified on resolve. */
  sourceMessageId?: string;
  clanLeaderApprovedBy?: string;
  reviewMessageId?: string;
  reviewChannelId?: string;
  denyReason?: string;
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
};

export type ClanCreateRequest = {
  id: string;
  guildId: string;
  applicantId: string;
  /** Rules thread or channel id — applicant is notified here on mod decision. */
  threadId: string;
  /** Original !создать message in the rules thread — notified on resolve. */
  sourceMessageId?: string;
  clanName: string;
  colorHex: number;
  colorLabel: string;
  memberIds: string[];
  leaderIds: string[];
  status: "pending" | "approved" | "denied";
  reviewMessageId?: string;
  reviewChannelId?: string;
  createdRoleId?: string;
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
  denyReason?: string;
};

/** Tracks understaffed / leaderless grace periods before auto-purge of a clan role. */
export type ClanRoleEnforcementState = {
  guildId: string;
  clanRoleId: string;
  clanRoleName: string;
  understaffedSinceMs?: number;
  leaderlessSinceMs?: number;
};
