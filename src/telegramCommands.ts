import { Telegraf } from "telegraf";
import { ADMIN_USER_IDS, LAST_SEEN_STATE_FILE } from "./config";
import { exboAuthors, replaceExboAuthors, saveState } from "./state";

function isAdmin(ctx: { from?: { id?: number } }): boolean {
  if (ADMIN_USER_IDS.length === 0) return true;
  const id = ctx.from?.id?.toString();
  return id !== undefined && ADMIN_USER_IDS.includes(id);
}

export function registerAdminCommands(bot: Telegraf): void {
  bot.command("chatid", (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = ctx.chat?.id;
    const type = ctx.chat?.type ?? "unknown";
    if (id === undefined) {
      return ctx.reply("Could not determine chat ID.");
    }
    return ctx.reply(`Chat ID: ${id} (${type})`);
  });

  bot.command("listauthors", (ctx) => {
    if (!isAdmin(ctx)) return;
    if (exboAuthors.length === 0) {
      return ctx.reply("No Exbo authors configured. Add one with /addauthor <username>");
    }
    return ctx.reply("Tracked Exbo authors:\n" + exboAuthors.map((a) => "• " + a).join("\n"));
  });

  bot.command("addauthor", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const args = ctx.message.text.split(/\s+/).slice(1);
    const username = args.join(" ").trim();
    if (!username) {
      return ctx.reply("Usage: /addauthor <exbo_username>");
    }
    if (exboAuthors.includes(username)) {
      return ctx.reply(`Already tracking "${username}".`);
    }
    exboAuthors.push(username);
    const saved = await saveState(LAST_SEEN_STATE_FILE);
    const msg = `Added "${username}". Now tracking: ${exboAuthors.join(", ")}`;
    return ctx.reply(saved ? msg : msg + "\n\nWarning: failed to save state to disk.");
  });

  bot.command("removeauthor", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const args = ctx.message.text.split(/\s+/).slice(1);
    const username = args.join(" ").trim();
    if (!username) {
      return ctx.reply("Usage: /removeauthor <exbo_username>");
    }
    const before = exboAuthors.length;
    const next = exboAuthors.filter((a) => a !== username);
    if (next.length === before) {
      return ctx.reply(`"${username}" was not in the list. Current: ${exboAuthors.join(", ") || "(none)"}`);
    }
    replaceExboAuthors(next);
    const saved = await saveState(LAST_SEEN_STATE_FILE);
    const msg = `Removed "${username}". Now tracking: ${exboAuthors.join(", ") || "(none)"}`;
    return ctx.reply(saved ? msg : msg + "\n\nWarning: failed to save state to disk.");
  });
}
