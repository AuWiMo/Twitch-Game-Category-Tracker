function parsePositiveInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseCliOverrides(argv = []) {
  const overrides = {
    twitchGameId: undefined,
    webhookUrl: undefined
  };
  let sawGameIdFlag = false;
  let sawWebhookUrlFlag = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--game-id") {
      sawGameIdFlag = true;
      overrides.twitchGameId = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith("--game-id=")) {
      sawGameIdFlag = true;
      overrides.twitchGameId = arg.slice("--game-id=".length);
      continue;
    }

    if (arg === "--webhook-url") {
      sawWebhookUrlFlag = true;
      overrides.webhookUrl = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith("--webhook-url=")) {
      sawWebhookUrlFlag = true;
      overrides.webhookUrl = arg.slice("--webhook-url=".length);
    }
  }

  if (sawGameIdFlag && (!overrides.twitchGameId || String(overrides.twitchGameId).startsWith("--"))) {
    throw new Error("--game-id requires a value.");
  }

  if (sawWebhookUrlFlag && (!overrides.webhookUrl || String(overrides.webhookUrl).startsWith("--"))) {
    throw new Error("--webhook-url requires a value.");
  }

  if (overrides.twitchGameId !== undefined && !/^\d+$/.test(String(overrides.twitchGameId))) {
    throw new Error("--game-id must be a numeric Twitch game/category ID.");
  }

  if (overrides.webhookUrl !== undefined && !String(overrides.webhookUrl).trim()) {
    throw new Error("--webhook-url must not be empty.");
  }

  return {
    twitchGameId: overrides.twitchGameId,
    webhookUrl: overrides.webhookUrl
  };
}

function loadConfig() {
  const cliOverrides = parseCliOverrides(process.argv.slice(2));

  const config = {
    twitchClientId: process.env.TWITCH_CLIENT_ID,
    twitchClientSecret: process.env.TWITCH_CLIENT_SECRET,
    twitchGameId: cliOverrides.twitchGameId || process.env.TWITCH_GAME_ID,
    twitchGameName: process.env.TWITCH_GAME_NAME,
    webhookUrl: cliOverrides.webhookUrl || process.env.WEBHOOK_URL,
    discordPingRoleId: process.env.DISCORD_PING_ROLE_ID,
    pollIntervalSeconds: parsePositiveInt("POLL_INTERVAL_SECONDS", 60),
    offlineConfirmationPolls: parsePositiveInt("OFFLINE_CONFIRMATION_POLLS", 5),
    liveNotifyDelaySeconds: parsePositiveInt("LIVE_NOTIFY_DELAY_SECONDS", 180),
    requestTimeoutMs: parsePositiveInt("REQUEST_TIMEOUT_MS", 15000),
    startupNotifyExistingLive: (process.env.STARTUP_NOTIFY_EXISTING_LIVE || "false").toLowerCase() === "true"
  };

  if (!config.twitchClientId) {
    throw new Error("Missing required env var: TWITCH_CLIENT_ID");
  }

  if (!config.twitchClientSecret) {
    throw new Error("Missing required env var: TWITCH_CLIENT_SECRET");
  }

  if (!config.webhookUrl) {
    throw new Error("Missing required env var: WEBHOOK_URL");
  }

  if (!config.twitchGameId && !config.twitchGameName) {
    throw new Error("Set TWITCH_GAME_ID or TWITCH_GAME_NAME.");
  }

  if (config.discordPingRoleId !== undefined && config.discordPingRoleId !== "" && !/^\d+$/.test(config.discordPingRoleId)) {
    throw new Error("DISCORD_PING_ROLE_ID must be a numeric Discord role ID.");
  }

  return config;
}

module.exports = {
  loadConfig
};
