## Codebase Overview

This repository is a **TypeScript Node service** that polls **Exbo (Flarum) JSON:API** for new posts/comments, formats them as **HTML**, and sends them to **Telegram** chats. The same process hosts a **Discord.js** bot for **slash commands** (announcements, role panels, link panel) and **automod** plus **staff moderation** tools, with **JSON state** on disk or **Upstash Redis**.

**Stack**: Node 18+, TypeScript (strict) → CommonJS `dist/`, Telegraf, discord.js, `@upstash/redis`, dotenv.

**Structure**: `src/index.ts` boots Telegraf, Discord, and the Exbo poll loop; `src/config.ts` centralizes env; `src/state.ts` + `src/stateStore.ts` own persistence; `src/exbo.ts` and `src/telegram*.ts` handle forum→Telegram; `src/discord/*` implements Discord interactions and moderation.

For detailed architecture, diagrams, and navigation, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).
