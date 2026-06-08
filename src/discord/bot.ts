import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { once } from "node:events";
import { DISCORD_BOT_TOKEN, DISCORD_DEV_MODE, DISCORD_GUILD_ID, LOG_LEVEL, clanRolesConfigured, sleep } from "../config";
import { discordCommonReplies as com } from "./userStrings";
import {
  handleDiscordCommand,
  handleDiscordModal,
  registerGuildCommands,
  unregisterGuildCommands,
} from "./commands";
import { handleModerationAutocomplete } from "./moderationCommands";
import { handleMessageReviewCreate, handleMessageReviewDelete } from "./messageReview";
import { handleModerationMessage } from "./moderation";
import { handleClanAdFormatMessage, handleClanAdFormatMessageUpdate, clearClanAdPendingOnDelete } from "./clanAdFormat";
import { handleRoleButtonInteraction } from "./roles";
import {
  handleTempVoiceButton,
  handleTempVoiceModal,
  handleTempVoiceStateUpdate,
  handleTempVoiceStringSelect,
  handleTempVoiceUserSelect,
  sweepTempVoiceOnReady,
} from "./tempVoice";
import {
  handleClanGrantButton,
  handleClanLeaderMetaClanButton,
  handleClanModButton,
  handleClanModModal,
  handleClanRulesMessage,
  initClanRolesModule,
  isClanRolesInteractionCustomId,
  startClanEnforcementScheduler,
  startClanThreadCleanupScheduler,
  stopClanEnforcementScheduler,
  stopClanThreadCleanupScheduler,
} from "./clanRoles";
import {
  handleStaffSummaryCreatorMessage,
  handleStaffSummaryMemberAvailable,
  handleStaffSummaryMemberUpdate,
  handleStaffSummaryRoleCreate,
  handleStaffSummaryRoleUpdate,
} from "./staffSummary";

let discordClient: Client | null = null;

const DISCORD_READY_TIMEOUT_MS = 30_000;

async function waitForDiscordReady(client: Client, readyPromise: Promise<unknown>): Promise<void> {
  if (client.isReady()) return;
  await Promise.race([
    readyPromise,
    sleep(DISCORD_READY_TIMEOUT_MS).then(() => {
      throw new Error(
        "Discord did not become ready within 30s. Stop other processes using the same DISCORD_BOT_TOKEN (local dev, Render, etc.) and restart.",
      );
    }),
  ]);
}

async function runDiscordReadySetup(client: Client): Promise<void> {
  const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
  await registerGuildCommands(guild);
  const commandCount = (await guild.commands.fetch()).size;
  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(`Discord slash commands registered (${commandCount}).`);
  }
  if (clanRolesConfigured()) {
    startClanEnforcementScheduler(guild);
    startClanThreadCleanupScheduler(guild);
  }
  void sweepTempVoiceOnReady(guild).catch((err) => {
    console.error("Discord temp voice sweep on ready failed:", err);
  });
  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(`Discord bot ready as ${client.user?.tag ?? "unknown"} in guild ${guild.id}.`);
  }
}

export async function startDiscordBot(): Promise<void> {
  if (!DISCORD_BOT_TOKEN) {
    throw new Error("Missing DISCORD_BOT_TOKEN in environment. Set it in .env");
  }
  if (!DISCORD_GUILD_ID) {
    throw new Error("Missing DISCORD_GUILD_ID in environment. Set it in .env");
  }
  if (discordClient) return;

  initClanRolesModule();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on("error", (err) => {
    console.error("Discord client error:", err);
  });

  client.on("shardError", (err) => {
    console.error("Discord shard error:", err);
  });

  client.on("interactionCreate", (interaction) => {
    void (async () => {
      try {
        if (interaction.isAutocomplete()) {
          await handleModerationAutocomplete(interaction);
          return;
        }
        if (interaction.isChatInputCommand()) {
          await handleDiscordCommand(interaction);
          return;
        }
        if (interaction.isModalSubmit()) {
          if (await handleTempVoiceModal(interaction)) return;
          if (await handleClanModModal(interaction)) return;
          await handleDiscordModal(interaction);
          return;
        }
        if (interaction.isStringSelectMenu()) {
          if (await handleTempVoiceStringSelect(interaction)) return;
          return;
        }
        if (interaction.isUserSelectMenu()) {
          if (await handleTempVoiceUserSelect(interaction)) return;
          return;
        }
        if (interaction.isButton()) {
          if (await handleTempVoiceButton(interaction)) return;
          if (isClanRolesInteractionCustomId(interaction.customId)) {
            if (await handleClanModButton(interaction)) return;
            if (await handleClanLeaderMetaClanButton(interaction)) return;
            if (await handleClanGrantButton(interaction)) return;
          }
          await handleRoleButtonInteraction(interaction);
        }
      } catch (err) {
        console.error("Discord interaction handler failed:", err);
        if (interaction.isRepliable() && !interaction.replied) {
          await interaction.reply({ content: com.internalError, flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }
      }
    })();
  });

  client.on("roleCreate", (role) => {
    void handleStaffSummaryRoleCreate(role).catch((err) => {
      console.error("Discord staff summary roleCreate handler failed:", err);
    });
  });

  client.on("roleUpdate", (oldRole, newRole) => {
    void handleStaffSummaryRoleUpdate(newRole, oldRole).catch((err) => {
      console.error("Discord staff summary roleUpdate handler failed:", err);
    });
  });

  client.on("guildMemberUpdate", (oldMember, newMember) => {
    void handleStaffSummaryMemberUpdate(oldMember, newMember).catch((err) => {
      console.error("Discord staff summary guildMemberUpdate handler failed:", err);
    });
  });

  client.on("guildMemberAvailable", (member) => {
    void handleStaffSummaryMemberAvailable(member).catch((err) => {
      console.error("Discord staff summary guildMemberAvailable handler failed:", err);
    });
  });

  client.on("messageCreate", (message) => {
    void (async () => {
      let clanHandled = false;
      try {
        clanHandled = await handleClanRulesMessage(message);
      } catch (err) {
        console.error("Discord clan rules message handler failed:", err);
      }

      if (!clanHandled) {
        let formatHandled = false;
        try {
          formatHandled = await handleClanAdFormatMessage(message);
        } catch (err) {
          console.error("Discord clan ad format handler failed:", err);
        }

        if (!formatHandled) {
          void handleModerationMessage(message).catch((err) => {
            console.error("Discord moderation handler failed:", err);
          });
        }
      }

      void handleStaffSummaryCreatorMessage(message).catch((err) => {
        console.error("Discord staff summary creator message handler failed:", err);
      });
      void handleMessageReviewCreate(message).catch((err) => {
        console.error("Discord message review create handler failed:", err);
      });
    })();
  });

  client.on("messageDelete", (message) => {
    clearClanAdPendingOnDelete(message.id);
    void handleMessageReviewDelete(message).catch((err) => {
      console.error("Discord message review delete handler failed:", err);
    });
  });

  client.on("messageUpdate", (oldMessage, newMessage) => {
    void (async () => {
      try {
        await handleClanAdFormatMessageUpdate(oldMessage, newMessage);
      } catch (err) {
        console.error("Discord clan ad format update handler failed:", err);
      }
    })();
  });

  client.on("voiceStateUpdate", (oldState, newState) => {
    void handleTempVoiceStateUpdate(oldState, newState).catch((err) => {
      console.error("Discord temp voice stateUpdate handler failed:", err);
    });
  });

  const readyPromise = once(client, Events.ClientReady);
  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log("Discord connecting…");
  }
  await client.login(DISCORD_BOT_TOKEN);
  discordClient = client;
  await waitForDiscordReady(client, readyPromise);
  await runDiscordReadySetup(client);
}

export type StopDiscordBotOptions = {
  /** Dev-only: remove guild slash commands (default false). Use for intentional local dev quit. */
  clearSlashCommands?: boolean;
};

export async function stopDiscordBot(opts?: StopDiscordBotOptions): Promise<void> {
  if (opts?.clearSlashCommands && DISCORD_DEV_MODE) {
    if (!discordClient) {
      console.warn("Dev: slash commands not cleared (Discord not connected).");
    } else {
      const client = discordClient;
      try {
        const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
        await unregisterGuildCommands(guild);
        console.log("Dev: slash commands cleared.");
      } catch (err) {
        console.error("Dev: failed to clear slash commands:", err);
      }
    }
  }

  if (!discordClient) return;
  stopClanEnforcementScheduler();
  stopClanThreadCleanupScheduler();
  discordClient.destroy();
  discordClient = null;
}
