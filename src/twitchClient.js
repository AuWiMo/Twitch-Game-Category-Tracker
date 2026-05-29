const AUTH_URL = "https://id.twitch.tv/oauth2/token";
const API_BASE_URL = "https://api.twitch.tv/helix";
const { fetchWithTimeout } = require("./http");

class TwitchClient {
  constructor({ clientId, clientSecret, requestTimeoutMs = 15000 }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.requestTimeoutMs = requestTimeoutMs;
    this.appToken = null;
    this.tokenExpiresAtMs = 0;
  }

  async getAppToken() {
    const now = Date.now();
    if (this.appToken && now < this.tokenExpiresAtMs - 60_000) {
      return this.appToken;
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials"
    });

    const response = await fetchWithTimeout(AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Unable to get app token (${response.status}): ${text}`);
    }

    const data = await response.json();
    this.appToken = data.access_token;
    this.tokenExpiresAtMs = now + (data.expires_in || 0) * 1000;
    return this.appToken;
  }

  async apiGet(path, query = {}) {
    await this.getAppToken();

    const url = new URL(`${API_BASE_URL}${path}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });

    let response = await this.fetchHelix(url.toString());

    if (response.status === 401) {
      this.appToken = null;
      await this.getAppToken();
      response = await this.fetchHelix(url.toString());
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twitch API error ${response.status} on ${path}: ${text}`);
    }

    return response.json();
  }

  async resolveGameId({ gameId, gameName }) {
    if (gameId) {
      return gameId;
    }

    const payload = await this.apiGet("/games", { name: gameName });
    const game = payload.data && payload.data[0];

    if (!game) {
      throw new Error(`No game/category found for name: ${gameName}`);
    }

    return game.id;
  }

  async validateAuthentication() {
    await this.getAppToken();
    await this.apiGet("/streams", { first: 1 });
  }

  async getStreamsByGameId(gameId) {
    // Twitch docs: Get Streams supports `first` up to 100.
    const payload = await this.apiGet("/streams", {
      game_id: gameId,
      first: 100,
      type: "live"
    });

    return payload.data || [];
  }

  async fetchHelix(url) {
    const requestOptions = {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.appToken}`,
        "Client-Id": this.clientId
      }
    };

    let response = await fetchWithTimeout(url, requestOptions, this.requestTimeoutMs);

    // Twitch API guide recommends retrying once on 503.
    if (response.status === 503) {
      response = await fetchWithTimeout(url, requestOptions, this.requestTimeoutMs);
    }

    return response;
  }
}

module.exports = {
  TwitchClient
};
