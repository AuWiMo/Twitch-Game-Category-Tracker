class WebhookClient {
  constructor({ webhookUrl, requestTimeoutMs = 15000 }) {
    this.webhookUrl = webhookUrl;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async sendStreamLive({ stream, gameId }) {
    const streamerLogin = stream.user_login || "unknown_streamer";
    const streamerName = stream.user_name || streamerLogin;
    const twitchUrl = `https://www.twitch.tv/${streamerLogin}`;

    const payload = {
      content: `LIVE: ${streamerName} is now live in ${stream.game_name || "Unknown Category"}`,
      embeds: [
        {
          title: stream.title || "Stream is live",
          url: twitchUrl,
          description: `Watch ${streamerName} on Twitch`,
          fields: [
            {
              name: "Category",
              value: stream.game_name || String(gameId || "Unknown"),
              inline: true
            },
            {
              name: "Viewers",
              value: String(stream.viewer_count ?? 0),
              inline: true
            },
            {
              name: "Language",
              value: stream.language || "unknown",
              inline: true
            }
          ],
          timestamp: stream.started_at || new Date().toISOString(),
          image: stream.thumbnail_url
            ? {
                url: stream.thumbnail_url
                  .replace("{width}", "1280")
                  .replace("{height}", "720")
              }
            : undefined,
          footer: {
            text: `Streamer: ${streamerLogin}`
          }
        }
      ],
      allowed_mentions: {
        parse: []
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Webhook returned ${response.status}: ${text}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

module.exports = {
  WebhookClient
};
