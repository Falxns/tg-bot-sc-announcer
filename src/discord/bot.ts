import { Client, GatewayIntentBits, MessageFlags } from "discord.js";
import { DISCORD_BOT_TOKEN, DISCORD_DEV_MODE, DISCORD_GUILD_ID, LOG_LEVEL, clanRolesConfigured } from "../config";
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
  stopClanEnforcementScheduler,
} from "./clanRoles";
import {
  handleStaffSummaryCreatorMessage,
  handleStaffSummaryMemberAvailable,
  handleStaffSummaryMemberUpdate,
  handleStaffSummaryRoleCreate,
  handleStaffSummaryRoleUpdate,
} from "./staffSummary";

let discordClient: Client | null = null;

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

  client.once("clientReady", () => {
    void (async () => {
      try {
        const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
        await registerGuildCommands(guild);
        await sweepTempVoiceOnReady(guild);
        if (clanRolesConfigured()) {
          startClanEnforcementScheduler(guild);
        }
        if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
          console.log(`Discord bot ready as ${client.user?.tag ?? "unknown"} in guild ${guild.id}.`);
        }
      } catch (err) {
        console.error("Discord command registration failed:", err);
      }
    })();
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
        void handleModerationMessage(message).catch((err) => {
          console.error("Discord moderation handler failed:", err);
        });
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
    void handleMessageReviewDelete(message).catch((err) => {
      console.error("Discord message review delete handler failed:", err);
    });
  });

  client.on("voiceStateUpdate", (oldState, newState) => {
    void handleTempVoiceStateUpdate(oldState, newState).catch((err) => {
      console.error("Discord temp voice stateUpdate handler failed:", err);
    });
  });

  await client.login(DISCORD_BOT_TOKEN);
  discordClient = client;
}

export async function stopDiscordBot(): Promise<void> {
  if (DISCORD_DEV_MODE) {
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
  discordClient.destroy();
  discordClient = null;
}
