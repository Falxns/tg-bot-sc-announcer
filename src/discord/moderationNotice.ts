import {
  buildChannelPurposeReason,
  channelIdForChannelPreset,
  channelPresetIdForChannel,
  formatReasonForEmbed,
  reasonPlainTextForAudit,
} from "./moderationReasonPresets";
import type { ModerationLogPayload } from "./moderationLog";
import { buildRuleUserReason, getRulePresetById } from "./moderationRulePresets";

export type ResolvedModerationNotice = {
  channelReason?: string;
  ruleReason?: string;
  rulePoint?: string;
  ruleShortTitle?: string;
  /** When custom `reason` overrides presets — single legacy block. */
  customOnly?: string;
  combinedReason: string;
  auditReason: string;
};

export type ResolveModerationNoticeOpts = {
  custom?: string | null;
  channelPresetId?: string | null;
  rulePresetId?: string | null;
  scopeChannelId?: string;
  defaultReason: string;
};

export type ModerationNoticeEmbedLabels = {
  reason: string;
  channelViolation: string;
  ruleServer: (point: string) => string;
};

function resolveChannelReason(channelPresetId: string, scopeChannelId?: string): string | undefined {
  const channelId = channelIdForChannelPreset(channelPresetId, scopeChannelId);
  if (!channelId) return undefined;
  return buildChannelPurposeReason(channelPresetId, channelId);
}

function channelPresetIdFromOpts(opts: ResolveModerationNoticeOpts): string | undefined {
  const raw = opts.channelPresetId?.trim();
  if (raw) return raw;
  if (opts.scopeChannelId) return channelPresetIdForChannel(opts.scopeChannelId);
  return undefined;
}

export function resolveModerationNotice(opts: ResolveModerationNoticeOpts): ResolvedModerationNotice {
  const custom = opts.custom?.trim();
  if (custom) {
    return {
      customOnly: custom,
      combinedReason: custom,
      auditReason: reasonPlainTextForAudit(custom),
    };
  }

  let channelReason: string | undefined;
  const channelId = channelPresetIdFromOpts(opts);
  if (channelId) {
    channelReason = resolveChannelReason(channelId, opts.scopeChannelId);
  }

  let ruleReason: string | undefined;
  let rulePoint: string | undefined;
  let ruleShortTitle: string | undefined;
  const ruleRaw = opts.rulePresetId?.trim();
  if (ruleRaw) {
    const preset = getRulePresetById(ruleRaw);
    if (preset) {
      ruleReason = buildRuleUserReason(ruleRaw);
      rulePoint = preset.point;
      ruleShortTitle = preset.shortTitle;
    }
  }

  const combinedParts: string[] = [];
  if (channelReason) combinedParts.push(channelReason);
  if (ruleReason) combinedParts.push(ruleReason);
  const combinedReason =
    combinedParts.length > 0 ? combinedParts.join("\n\n") : opts.defaultReason;

  const auditParts: string[] = [];
  if (channelReason) auditParts.push("канал");
  if (rulePoint) {
    const preset = ruleRaw ? getRulePresetById(ruleRaw) : undefined;
    auditParts.push(`п. ${rulePoint}${preset ? ` ${preset.shortTitle}` : ""}`);
  }
  const auditReason =
    auditParts.length > 0
      ? reasonPlainTextForAudit(auditParts.join("; "))
      : reasonPlainTextForAudit(combinedReason);

  return {
    channelReason,
    ruleReason,
    rulePoint,
    ruleShortTitle,
    combinedReason,
    auditReason,
  };
}

/** Structured notice fields for moderation log embeds. */
export function moderationLogNoticePayload(
  notice: ResolvedModerationNotice,
  opts?: { automodReason?: string },
): Pick<
  ModerationLogPayload,
  "reason" | "channelReason" | "rulePoint" | "ruleTitle" | "ruleReason" | "automodReason"
> {
  return {
    reason: notice.combinedReason,
    channelReason: notice.channelReason,
    rulePoint: notice.rulePoint,
    ruleTitle: notice.ruleShortTitle,
    ruleReason: notice.ruleReason,
    automodReason: opts?.automodReason,
  };
}

export function appendResolvedNoticeLines(
  lines: string[],
  notice: ResolvedModerationNotice,
  labels: ModerationNoticeEmbedLabels,
): void {
  if (notice.customOnly) {
    lines.push(`**${labels.reason}**`);
    lines.push(formatReasonForEmbed(notice.customOnly));
    return;
  }

  let any = false;
  if (notice.channelReason) {
    lines.push(`**${labels.channelViolation}**`);
    lines.push(formatReasonForEmbed(notice.channelReason));
    any = true;
  }
  if (notice.ruleReason && notice.rulePoint) {
    if (any) lines.push("");
    lines.push(`**${labels.ruleServer(notice.rulePoint)}**`);
    lines.push(formatReasonForEmbed(notice.ruleReason));
    any = true;
  }
  if (!any) {
    lines.push(`**${labels.reason}**`);
    lines.push(formatReasonForEmbed(notice.combinedReason));
  }
}
