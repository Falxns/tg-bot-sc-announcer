import "dotenv/config";
import { createServer } from "http";
import { Telegraf } from "telegraf";
import {
  chatIds,
  DISCORD_DEV_MODE,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
  POLL_INTERVAL_MS,
  STATE_BACKEND,
  TELEGRAM_BOT_TOKEN,
  UPSTASH_REDIS_REST_TOKEN,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_STATE_KEY,
} from "./config";
import { startDiscordBot, stopDiscordBot } from "./discord/bot";
import { pollExboAndAnnounce } from "./exbo";
import { loadState, saveState } from "./state";
import { registerAdminCommands } from "./telegramCommands";
import { flushTelegramSendQueue } from "./telegramSendQueue";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment. Set it in .env");
  process.exit(1);
}
if (!DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN in environment. Set it in .env");
  process.exit(1);
}
if (!DISCORD_GUILD_ID) {
  console.error("Missing DISCORD_GUILD_ID in environment. Set it in .env");
  process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

registerAdminCommands(bot);

let pollIntervalId: ReturnType<typeof setInterval> | undefined;
let shutdownInProgress = false;

async function shutdown(signal: string): Promise<void> {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  if (pollIntervalId !== undefined) clearInterval(pollIntervalId);

  // Discord dev cleanup needs a live gateway; run before slow Telegram/state I/O.
  await stopDiscordBot();

  await flushTelegramSendQueue();
  await saveState(LAST_SEEN_STATE_FILE);
  try {
    bot.stop(signal);
  } catch {
    // Telegraf throws if polling was never started or already stopped.
  }
  process.exit(0);
}

function onShutdownSignal(signal: string): void {
  void shutdown(signal).catch((err) => {
    console.error("Shutdown failed:", err);
    process.exit(1);
  });
}

/** Dev bot: SIGINT may not fire when Ctrl is remapped (e.g. Karabiner → arrows). */
function setupDevModeShutdownTriggers(): void {
  if (!DISCORD_DEV_MODE) return;

  console.log("Dev: q + Enter to stop (clears slash commands).");

  if (process.stdin.isTTY) {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      const line = chunk.toString().trim().toLowerCase();
      if (line === "q" || line === "quit" || line === ".quit") {
        onShutdownSignal("stdin-q");
      }
    });
  }
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
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn") {
      if (STATE_BACKEND === "upstash") {
        console.log(`State backend: upstash (key ${UPSTASH_STATE_KEY})`);
      } else {
        console.log(`State backend: file (${LAST_SEEN_STATE_FILE})`);
        if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
          console.warn(
            "UPSTASH_REDIS_REST_URL/TOKEN are set but STATE_BACKEND is not 'upstash'. " +
              "On Render the filesystem is ephemeral — set STATE_BACKEND=upstash or state will reset every deploy.",
          );
        }
      }
    }
    await loadState(LAST_SEEN_STATE_FILE);
    await startDiscordBot();
    setupDevModeShutdownTriggers();
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log("Bot started.");
      console.log(
        "Polling Exbo forum every",
        POLL_INTERVAL_MS / 1000,
        "seconds. Sending to",
        chatIds.length,
        "Telegram chat(s).",
      );
      console.log("Discord bot is running in the same process.");
    }
    void pollExboAndAnnounce(bot);
    pollIntervalId = setInterval(() => void pollExboAndAnnounce(bot), POLL_INTERVAL_MS);
  })
  .catch((err) => {
    console.error("Bot failed to start:", err);
    process.exit(1);
  });

process.once("SIGINT", () => onShutdownSignal("SIGINT"));
process.once("SIGTERM", () => onShutdownSignal("SIGTERM"));
process.once("SIGHUP", () => onShutdownSignal("SIGHUP"));
