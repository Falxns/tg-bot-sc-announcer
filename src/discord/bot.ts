import { Client, GatewayIntentBits, MessageFlags } from "discord.js";
import { DISCORD_BOT_TOKEN, DISCORD_DEV_MODE, DISCORD_GUILD_ID, LOG_LEVEL } from "../config";
import { discordCommonReplies as com } from "./userStrings";
import {
  handleDiscordCommand,
  handleDiscordModal,
  registerGuildCommands,
  unregisterGuildCommands,
} from "./commands";
import { handleModerationAutocomplete } from "./moderationCommands";
import { handleModerationMessage } from "./moderation";
import { handleRoleButtonInteraction } from "./roles";
import {
  handleStaffSummaryCreatorMessage,
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

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("clientReady", () => {
    void (async () => {
      try {
        const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
        await registerGuildCommands(guild);
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
          await handleDiscordModal(interaction);
          return;
        }
        if (interaction.isButton()) {
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

  client.on("messageCreate", (message) => {
    void handleStaffSummaryCreatorMessage(message).catch((err) => {
      console.error("Discord staff summary creator message handler failed:", err);
    });
    void handleModerationMessage(message).catch((err) => {
      console.error("Discord moderation handler failed:", err);
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
  discordClient.destroy();
  discordClient = null;
}
