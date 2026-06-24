const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class StreamMonitor {
  constructor({
    twitchClient,
    webhookClient,
    gameId,
    pollIntervalSeconds,
    offlineConfirmationPolls = 5,
    liveNotifyDelaySeconds = 180,
    startupNotifyExistingLive = false
  }) {
    this.twitchClient = twitchClient;
    this.webhookClient = webhookClient;
    this.gameId = gameId;
    this.pollIntervalSeconds = pollIntervalSeconds;
    this.offlineConfirmationPolls = offlineConfirmationPolls;
    this.liveNotifyDelaySeconds = liveNotifyDelaySeconds;
    this.startupNotifyExistingLive = startupNotifyExistingLive;
    this.running = false;
    this.currentLiveUsers = new Set();
    this.currentLiveUserNames = new Map();
    this.consecutiveMisses = new Map();
    this.handledStreamSessions = new Map();
    this.invalidStartedAtWarnings = new Map();
    this.hasBaseline = false;
    this.heartbeatLineActive = false;
    this.resolveStopSignal = null;
    this.stopSignal = null;
  }

  async start() {
    this.running = true;
    this.stopSignal = new Promise((resolve) => {
      this.resolveStopSignal = resolve;
    });
    this.logEvent(`[tracker] Monitoring game_id=${this.gameId} every ${this.pollIntervalSeconds}s`);

    while (this.running) {
      try {
        await this.pollOnce();
      } catch (error) {
        this.breakHeartbeatLine();
        console.error("[tracker] Poll error:", error.message);
      }

      await Promise.race([delay(this.pollIntervalSeconds * 1000), this.stopSignal]);
    }
  }

  stop() {
    this.breakHeartbeatLine();
    this.running = false;
    if (this.resolveStopSignal) {
      this.resolveStopSignal();
      this.resolveStopSignal = null;
    }
  }

  emitHeartbeatDot() {
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

  getValidStartedAtMs(stream) {
    const startedAt = stream.started_at;
    if (!startedAt) {
      return null;
    }

    const startedAtMs = Date.parse(startedAt);
    if (Number.isNaN(startedAtMs)) {
      return null;
    }

    return startedAtMs;
  }

  warnInvalidStartedAt(stream) {
    const userId = String(stream.user_id);
    const startedAt = stream.started_at || "";

    if (this.invalidStartedAtWarnings.get(userId) === startedAt) {
      return;
    }

    const streamerName = stream.user_name || stream.user_login || "unknown_streamer";
    this.logEvent(`[tracker] Skipping notification for ${streamerName}: invalid started_at value.`);
    this.invalidStartedAtWarnings.set(userId, startedAt);
  }

  markCurrentSessionsHandled(streams) {
    for (const stream of streams) {
      const userId = String(stream.user_id);
      if (this.getValidStartedAtMs(stream) === null) {
        this.warnInvalidStartedAt(stream);
        continue;
      }

      this.handledStreamSessions.set(userId, stream.started_at);
    }
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
      this.markCurrentSessionsHandled(streams);
      this.hasBaseline = true;
      this.emitHeartbeatDot();
      return;
    }

    const now = Date.now();
    const notifyCandidates = streams.filter((stream) => {
      const userId = String(stream.user_id);
      const startedAtMs = this.getValidStartedAtMs(stream);
      if (startedAtMs === null) {
        this.warnInvalidStartedAt(stream);
        return false;
      }

      if (this.handledStreamSessions.get(userId) === stream.started_at) {
        return false;
      }

      return now - startedAtMs >= this.liveNotifyDelaySeconds * 1000;
    });
    let failedNotification = null;

    const notifyTasks = notifyCandidates.map(async (stream) => {
      await this.webhookClient.sendStreamLive({ stream, gameId: this.gameId });
      this.handledStreamSessions.set(String(stream.user_id), stream.started_at);
      const timestamp = new Date().toISOString();
      const streamerName = stream.user_name || stream.user_login || "unknown_streamer";
      this.logEvent(`[tracker] ${timestamp} ${streamerName} has gone live! There are now ${streams.length} people playing!`);
      return true;
    });

    if (notifyTasks.length > 0) {
      const results = await Promise.allSettled(notifyTasks);
      if (results.some((result) => result.status === "fulfilled")) {
        hadVisibleChanges = true;
      }

      const failed = results.find((result) => result.status === "rejected");
      if (failed) {
        failedNotification = failed.reason;
      }
    }

    for (const userId of [...this.currentLiveUsers]) {
      if (liveUserIdsNow.has(userId)) {
        this.consecutiveMisses.set(userId, 0);
        continue;
      }

      const nextMissCount = (this.consecutiveMisses.get(userId) || 0) + 1;
      this.consecutiveMisses.set(userId, nextMissCount);

      if (nextMissCount >= this.offlineConfirmationPolls) {
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

    if (failedNotification) {
      throw failedNotification;
    }
  }
}

module.exports = {
  StreamMonitor
};
