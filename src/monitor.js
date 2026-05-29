const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class StreamMonitor {
  constructor({ twitchClient, webhookClient, gameId, pollIntervalSeconds, startupNotifyExistingLive = false }) {
    this.twitchClient = twitchClient;
    this.webhookClient = webhookClient;
    this.gameId = gameId;
    this.pollIntervalSeconds = pollIntervalSeconds;
    this.startupNotifyExistingLive = startupNotifyExistingLive;
    this.running = false;
    this.currentLiveUsers = new Set();
    this.currentLiveUserNames = new Map();
    this.consecutiveMisses = new Map();
    this.hasBaseline = false;
    this.heartbeatLineActive = false;
  }

  async start() {
    this.running = true;
    this.logEvent(`[tracker] Monitoring game_id=${this.gameId} every ${this.pollIntervalSeconds}s`);

    while (this.running) {
      try {
        await this.pollOnce();
      } catch (error) {
        this.breakHeartbeatLine();
        console.error("[tracker] Poll error:", error.message);
      }

      await delay(this.pollIntervalSeconds * 1000);
    }
  }

  stop() {
    this.breakHeartbeatLine();
    this.running = false;
  }

  emitHeartbeatDot() {
    if (this.heartbeatLineActive) {
      process.stdout.write(".");
      return;
    }

    process.stdout.write(".");
    this.heartbeatLineActive = true;
  }

  breakHeartbeatLine() {
    if (!this.heartbeatLineActive) {
      return;
    }

    process.stdout.write("\n");
    this.heartbeatLineActive = false;
  }

  logEvent(message) {
    this.breakHeartbeatLine();
    console.log(message);
  }

  async pollOnce() {
    const streams = await this.twitchClient.getStreamsByGameId(this.gameId);
    const liveUserIdsNow = new Set(streams.map((item) => String(item.user_id)));
    const liveUserNamesNow = new Map(
      streams.map((item) => [String(item.user_id), item.user_name || item.user_login || "unknown_streamer"])
    );
    let hadVisibleChanges = false;

    if (!this.hasBaseline) {
      this.logEvent(`[tracker] Startup check: ${streams.length} active streamer(s) currently live.`);
    }

    if (!this.hasBaseline && !this.startupNotifyExistingLive) {
      this.currentLiveUsers = liveUserIdsNow;
      this.currentLiveUserNames = liveUserNamesNow;
      this.consecutiveMisses = new Map();
      this.hasBaseline = true;
      this.emitHeartbeatDot();
      return;
    }

    const notifyCandidates = streams.filter((stream) => {
      const userId = String(stream.user_id);
      return !this.currentLiveUsers.has(userId);
    });

    for (const stream of notifyCandidates) {
      await this.webhookClient.sendStreamLive({ stream, gameId: this.gameId });
      const timestamp = new Date().toISOString();
      const streamerName = stream.user_name || stream.user_login || "unknown_streamer";
      this.logEvent(`[tracker] ${timestamp} ${streamerName} has gone live! There are now ${streams.length} people playing!`);
      hadVisibleChanges = true;
    }

    for (const userId of [...this.currentLiveUsers]) {
      if (liveUserIdsNow.has(userId)) {
        this.consecutiveMisses.set(userId, 0);
        continue;
      }

      const nextMissCount = (this.consecutiveMisses.get(userId) || 0) + 1;
      this.consecutiveMisses.set(userId, nextMissCount);

      if (nextMissCount >= 2) {
        const timestamp = new Date().toISOString();
        const streamerName = this.currentLiveUserNames.get(userId) || userId;
        this.logEvent(`[tracker] ${timestamp} ${streamerName} has stopped streaming.`);
        this.currentLiveUsers.delete(userId);
        this.currentLiveUserNames.delete(userId);
        this.consecutiveMisses.delete(userId);
        hadVisibleChanges = true;
      }
    }

    for (const userId of liveUserIdsNow) {
      this.currentLiveUsers.add(userId);
      this.currentLiveUserNames.set(userId, liveUserNamesNow.get(userId) || userId);
      this.consecutiveMisses.set(userId, 0);
    }

    this.hasBaseline = true;

    if (!hadVisibleChanges) {
      this.emitHeartbeatDot();
    }
  }
}

module.exports = {
  StreamMonitor
};
