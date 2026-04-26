import { Telegraf } from "telegraf";
import { chatIds, sleep, TELEGRAM_SEND_DELAY_MS } from "./config";

/** One announcement: HTML text plus forum image URLs to send as Telegram photos (same order as `Изображение N` in text). */
export type AnnouncePayload = {
  textHtml: string;
  imageUrls: string[];
};

const TELEGRAM_MEDIA_GROUP_MAX = 10;

async function sendWith429Retry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 429) {
      await sleep(5000);
      return await fn();
    }
    throw err;
  }
}

async function sendAnnouncementPhotosToChat(bot: Telegraf, chatId: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  let offset = 0;
  while (offset < urls.length) {
    if (offset > 0) await sleep(TELEGRAM_SEND_DELAY_MS);
    const rest = urls.length - offset;
    if (rest === 1) {
      const u = urls[offset]!;
      await sendWith429Retry(() => bot.telegram.sendPhoto(chatId, u));
      offset += 1;
      continue;
    }
    const take = Math.min(TELEGRAM_MEDIA_GROUP_MAX, rest);
    const chunk = urls.slice(offset, offset + take);
    const media = chunk.map((url) => ({ type: "photo" as const, media: url }));
    await sendWith429Retry(() => bot.telegram.sendMediaGroup(chatId, media));
    offset += take;
  }
}

export async function sendToTelegramChannels(
  bot: Telegraf,
  announcements: AnnouncePayload[],
): Promise<void> {
  if (announcements.length === 0) return;
  const sendOptions = {
    parse_mode: "HTML" as const,
    link_preview_options: { is_disabled: true },
  };
  for (const chatId of chatIds) {
    try {
      for (let i = 0; i < announcements.length; i++) {
        if (i > 0) await sleep(TELEGRAM_SEND_DELAY_MS);
        const payload = announcements[i];
        try {
          await sendWith429Retry(() => bot.telegram.sendMessage(chatId, payload.textHtml, sendOptions));
        } catch (sendErr: unknown) {
          throw sendErr;
        }
        try {
          await sendAnnouncementPhotosToChat(bot, chatId, payload.imageUrls);
        } catch (photoErr) {
          console.error("Failed to send Telegram photos for chat", chatId, photoErr);
        }
      }
      if (announcements.length > 0) await sleep(TELEGRAM_SEND_DELAY_MS);
    } catch (err) {
      console.error("Failed to send to Telegram chat", chatId, err);
    }
  }
}
