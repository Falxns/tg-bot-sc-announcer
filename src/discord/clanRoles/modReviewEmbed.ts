import { EmbedBuilder, type Message } from "discord.js";
import { clanTxt } from "./strings";

export function appendModReviewOutcome(
  embed: EmbedBuilder,
  status: "approved" | "denied",
  resolverId: string,
  reason?: string,
): EmbedBuilder {
  const resolver = `<@${resolverId}>`;
  const outcome =
    status === "approved"
      ? clanTxt.modReviewApproved(resolver)
      : clanTxt.modReviewDenied(resolver, reason);
  const next = EmbedBuilder.from(embed.data);
  const base = next.data.description ?? "";
  next.setDescription(`${base}\n\n${outcome}`.slice(0, 4096));
  next.setColor(status === "approved" ? 0x57f287 : 0xed4245);
  next.setFooter(null);
  return next;
}

export async function markModReviewMessageResolved(
  message: Message,
  status: "approved" | "denied",
  resolverId: string,
  reason?: string,
): Promise<void> {
  const embedData = message.embeds[0];
  if (!embedData) {
    await message.edit({ components: [] }).catch(() => undefined);
    return;
  }
  const updated = appendModReviewOutcome(EmbedBuilder.from(embedData.data), status, resolverId, reason);
  await message.edit({ embeds: [updated], components: [] }).catch(() => undefined);
}
