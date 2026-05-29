const { TwitchClient } = require("./twitchClient");

function printUsage() {
  console.log("Usage: npm run test:category -- <game name | slug | Twitch category URL>");
  console.log("Example: npm run test:category -- https://www.twitch.tv/directory/category/fortnite");
}

function parseInput(rawInput) {
  const input = String(rawInput || "").trim();
  if (!input) {
    return "";
  }

  try {
    const url = new URL(input);
    const segments = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] || "").trim();
  } catch {
    return input;
  }
}

function toSearchQuery(value) {
  return value
    .replace(/^directory\/category\//i, "")
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectBestMatch(matches, originalInput, query) {
  if (!matches.length) {
    return null;
  }

  const normalizedInput = normalize(originalInput);
  const normalizedQuery = normalize(query);

  const exact = matches.find((item) => {
    const normalizedName = normalize(item.name);
    return normalizedName === normalizedInput || normalizedName === normalizedQuery;
  });

  return exact || matches[0];
}

async function main() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET before running this test.");
  }

  const originalInput = parseInput(process.argv.slice(2).join(" "));
  if (!originalInput) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const query = toSearchQuery(originalInput);
  const client = new TwitchClient({ clientId, clientSecret });

  const searchPayload = await client.apiGet("/search/categories", {
    query,
    first: 10
  });

  const matches = searchPayload.data || [];

  if (!matches.length) {
    console.log(`No categories found for query: ${query}`);
    process.exitCode = 1;
    return;
  }

  const best = selectBestMatch(matches, originalInput, query);
  const verifyPayload = await client.apiGet("/games", { id: best.id });
  const canonical = (verifyPayload.data && verifyPayload.data[0]) || best;

  console.log("Recommended API values:");
  console.log(`- TWITCH_GAME_ID=${canonical.id}`);
  console.log(`- TWITCH_GAME_NAME=${canonical.name}`);
  console.log("");
  console.log("Top category matches:");

  matches.forEach((item, index) => {
    const marker = item.id === canonical.id ? "*" : " ";
    console.log(`${marker} ${index + 1}. ${item.name} (id: ${item.id})`);
  });

  console.log("");
  console.log("Tip: prefer TWITCH_GAME_ID in your tracker config to avoid name ambiguity.");
}

main().catch((error) => {
  console.error(`Category lookup test failed: ${error.message}`);
  process.exitCode = 1;
});
