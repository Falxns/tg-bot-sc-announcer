import { tempVoiceStrings as tv } from "./strings";

function discordErrorDetail(err: unknown): string | null {
  if (!err || typeof err !== "object") {
    return err instanceof Error && err.message ? err.message : null;
  }
  const o = err as { code?: number; message?: string; rawError?: { message?: string } };
  const parts: string[] = [];
  if (typeof o.code === "number") parts.push(String(o.code));
  const msg = o.message ?? o.rawError?.message;
  if (typeof msg === "string" && msg.length > 0) parts.push(msg);
  return parts.length > 0 ? parts.join(": ") : null;
}

/** Log and format a user-visible temp-voice action error (includes Discord API detail when present). */
export function formatTempVoiceActionError(err: unknown, context?: string): string {
  const prefix = context ? `[Temp voice] ${context} failed:` : "[Temp voice] action failed:";
  console.error(prefix, err);
  const detail = discordErrorDetail(err);
  return detail ? tv.actionFailedDetail(detail) : tv.actionFailed;
}
