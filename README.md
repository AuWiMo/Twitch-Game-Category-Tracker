# Twitch-Game-Category-Tracker

Node.js app that monitors a Twitch game category and sends a webhook when a stream goes live.

## Features

- Uses Twitch app access tokens via client credentials flow.
- Verifies Twitch authentication at startup before entering monitor loop.
- Polls Twitch Get Streams filtered by `game_id`.
- Resolves game IDs from game name when needed.
- Sends one webhook event per streamer when they transition to live.
- Uses only system/process environment variables (no `.env` file required).
- Pinned to Node.js 26.

## Project Structure

```
.
|-- .gitignore
|-- .nvmrc
|-- package.json
|-- README.md
`-- src
		|-- config.js
		|-- index.js
		|-- monitor.js
		|-- twitchClient.js
		`-- webhookClient.js
```

## Requirements

- Node.js `26.x`
- Twitch app credentials:
	- `TWITCH_CLIENT_ID`
	- `TWITCH_CLIENT_SECRET`
- A destination webhook URL (env var or `--webhook-url` parameter)

## Environment Variables

Required:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `WEBHOOK_URL` (unless passed via `--webhook-url`)
- One of (unless passed via `--game-id`):
	- `TWITCH_GAME_ID` (preferred)
	- `TWITCH_GAME_NAME`

Optional:

- `POLL_INTERVAL_SECONDS` (default: `60`)
- `REQUEST_TIMEOUT_MS` (default: `15000`)
- `STARTUP_NOTIFY_EXISTING_LIVE` (default: `false`)

## Configure Environment (System Level)

Windows PowerShell (current process):

```powershell
$env:TWITCH_CLIENT_ID="your_client_id"
$env:TWITCH_CLIENT_SECRET="your_client_secret"
$env:WEBHOOK_URL="https://example.com/webhook"
$env:TWITCH_GAME_ID="33214"
```

Windows PowerShell (persist for your user):

```powershell
[Environment]::SetEnvironmentVariable("TWITCH_CLIENT_ID", "your_client_id", "User")
[Environment]::SetEnvironmentVariable("TWITCH_CLIENT_SECRET", "your_client_secret", "User")
[Environment]::SetEnvironmentVariable("WEBHOOK_URL", "https://example.com/webhook", "User")
[Environment]::SetEnvironmentVariable("TWITCH_GAME_ID", "33214", "User")
```

If you prefer to use name-based lookup instead, set `TWITCH_GAME_NAME` and omit `TWITCH_GAME_ID`.

## Install and Run

```bash
npm install
npm start
```

Run with one-off CLI overrides (take precedence over env vars):

```bash
npm start -- --game-id 33214
npm start -- --webhook-url https://example.com/webhook
npm start -- --game-id 33214 --webhook-url https://example.com/webhook
```

Supported override parameters:

- `--game-id <id>` or `--game-id=<id>`
- `--webhook-url <url>` or `--webhook-url=<url>`

Development watch mode:

```bash
npm run dev
```

## Find Correct API Category Values (Test)

Use this helper test to resolve the canonical Twitch API category values from a name, slug, or Twitch category URL.

Examples:

```bash
npm run test:category -- Fortnite
npm run test:category -- fortnite
npm run test:category -- https://www.twitch.tv/directory/category/fortnite
```

The test prints:

- Recommended `TWITCH_GAME_ID` (preferred for tracker config)
- Recommended `TWITCH_GAME_NAME`
- Top matches returned by Twitch search

Only `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are required to run this test.

Recommended setup flow:

1. Run the lookup test with a category URL, slug, or game name.
2. Copy the printed `TWITCH_GAME_ID` value.
3. Set `TWITCH_GAME_ID` in your environment and do not set `TWITCH_GAME_NAME`.

Example (persist for your user):

```powershell
[Environment]::SetEnvironmentVariable("TWITCH_GAME_ID", "<id from test output>", "User")
```

## Webhook Payload

The app sends Discord-compatible `POST` JSON payloads like:

```json
{
	"content": "LIVE: ExampleStreamer is now live in Fortnite",
	"embeds": [
		{
			"title": "Ranked grind",
			"url": "https://www.twitch.tv/example_streamer",
			"description": "Watch ExampleStreamer on Twitch",
			"fields": [
				{
					"name": "Category",
					"value": "Fortnite",
					"inline": true
				},
				{
					"name": "Viewers",
					"value": "120",
					"inline": true
				},
				{
					"name": "Language",
					"value": "en",
					"inline": true
				}
			],
			"timestamp": "2026-05-29T09:58:20Z",
			"image": {
				"url": "https://static-cdn.jtvnw.net/..."
			},
			"footer": {
				"text": "Streamer: example_streamer"
			}
		}
	],
	"allowed_mentions": {
		"parse": []
	}
}
```

## API References Used

- OAuth client credentials flow:
	- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow
- Get Streams endpoint:
	- https://dev.twitch.tv/docs/api/reference#get-streams
- Get Games endpoint:
	- https://dev.twitch.tv/docs/api/reference#get-games
- API concepts (rate limits, retries, pagination):
	- https://dev.twitch.tv/docs/api/guide

## Notes

- `Get Streams` returns only currently live streams; offline channels are not included.
- The app keeps in-memory state of currently live users to detect offline->live transitions.
- Restarting the app resets that in-memory state.
