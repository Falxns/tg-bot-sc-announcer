/**
 * Serializes outbound Telegram sends so producers (Exbo poll, future Discord, etc.)
 * never run `sendToTelegramChannels` concurrently. New integrations should call
 * `enqueueTelegramSend` only — do not invoke Telegram send APIs in parallel.
 */
let telegramSendChain: Promise<void> = Promise.resolve();

export function enqueueTelegramSend(job: () => Promise<void>): void {
  telegramSendChain = telegramSendChain
    .then(() => job())
    .catch((err: unknown) => console.error("Telegram send queue:", err));
}

export async function flushTelegramSendQueue(): Promise<void> {
  await telegramSendChain;
}
