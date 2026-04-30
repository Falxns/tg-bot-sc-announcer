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
};

export type DiscordChannelPolicy = {
  blockInviteLinks?: boolean;
  allowInviteRoleIds?: string[];
  blockVideos?: boolean;
  blockImages?: boolean;
  blockText?: boolean;
  blockedKeywords?: string[];
};

export type DiscordChannelPolicyMap = Record<string, DiscordChannelPolicy>;
