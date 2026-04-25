import "dotenv/config";
import { createServer } from "http";
import { Telegraf } from "telegraf";
import { chatIds, LAST_SEEN_STATE_FILE, LOG_LEVEL, POLL_INTERVAL_MS, TELEGRAM_BOT_TOKEN } from "./config";
import { pollExboAndAnnounce } from "./exbo";
import { loadState, saveState } from "./state";
import { registerAdminCommands } from "./telegramCommands";
import { flushTelegramSendQueue } from "./telegramSendQueue";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment. Set it in .env");
  process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

registerAdminCommands(bot);

let pollIntervalId: ReturnType<typeof setInterval> | undefined;

async function shutdown(): Promise<void> {
  if (pollIntervalId !== undefined) clearInterval(pollIntervalId);
  await flushTelegramSendQueue();
  await saveState(LAST_SEEN_STATE_FILE);
  await bot.stop();
  process.exit(0);
}

const PORT = process.env.PORT;
if (PORT) {
  createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  }).listen(PORT, () => {
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log("Health check server listening on port", PORT);
    }
  });
}

bot
  .launch(async () => {
    await loadState(LAST_SEEN_STATE_FILE);
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log("Bot started.");
      console.log(
        "Polling Exbo forum every",
        POLL_INTERVAL_MS / 1000,
        "seconds. Sending to",
        chatIds.length,
        "Telegram chat(s).",
      );
    }
    void pollExboAndAnnounce(bot);
    pollIntervalId = setInterval(() => void pollExboAndAnnounce(bot), POLL_INTERVAL_MS);
  })
  .catch((err) => {
    console.error("Bot failed to start:", err);
    process.exit(1);
  });

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
