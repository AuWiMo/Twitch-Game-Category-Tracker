const { loadConfig } = require("./config");
const { TwitchClient } = require("./twitchClient");
const { WebhookClient } = require("./webhookClient");
const { StreamMonitor } = require("./monitor");

async function main() {
  const config = loadConfig();

  const twitchClient = new TwitchClient({
    clientId: config.twitchClientId,
    clientSecret: config.twitchClientSecret,
    requestTimeoutMs: config.requestTimeoutMs
  });

  console.log("[tracker] Verifying Twitch authentication...");
  await twitchClient.validateAuthentication();
  console.log("[tracker] Twitch authentication verified.");

  const gameId = await twitchClient.resolveGameId({
    gameId: config.twitchGameId,
    gameName: config.twitchGameName
  });

  const webhookClient = new WebhookClient({
    webhookUrl: config.webhookUrl,
    requestTimeoutMs: config.requestTimeoutMs
  });

  const monitor = new StreamMonitor({
    twitchClient,
    webhookClient,
    gameId,
    pollIntervalSeconds: config.pollIntervalSeconds,
    startupNotifyExistingLive: config.startupNotifyExistingLive
  });

  const gracefulShutdown = (signal) => {
    const stopReason = signal === "SIGINT" ? "Manual stop requested" : "System stop requested";
    console.log(`\n[tracker] ${stopReason}. Stopping monitor.`);
    monitor.stop();
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  await monitor.start();
}

main().catch((error) => {
  console.error("[tracker] Fatal error:", error);
  process.exitCode = 1;
});
