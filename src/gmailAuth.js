// One-time interactive OAuth setup for Gmail.
//
// Usage:
//   1. Create a Google Cloud project, enable the Gmail API, and download an
//      OAuth client (Desktop app) as credentials.json at the repo root.
//   2. Run `npm run auth` and follow the printed URL.
//   3. Paste the code back into the prompt. A token.json will be written to
//      data/token.json and used by the server + poller.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { google } = require("googleapis");
require("dotenv").config();

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

function loadCredentials() {
  const p = process.env.GMAIL_CREDENTIALS_PATH || "./credentials.json";
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing Gmail credentials at ${p}. See README for setup instructions.`,
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function buildOAuthClient() {
  const creds = loadCredentials();
  const info = creds.installed || creds.web;
  if (!info) throw new Error("credentials.json is missing `installed` or `web` block");
  const { client_id, client_secret, redirect_uris } = info;
  return new google.auth.OAuth2(
    client_id,
    client_secret,
    (redirect_uris && redirect_uris[0]) || "urn:ietf:wg:oauth:2.0:oob",
  );
}

async function getAuthedClient() {
  const oAuth2Client = buildOAuthClient();
  const tokenPath = process.env.GMAIL_TOKEN_PATH || "./data/token.json";
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `No Gmail token at ${tokenPath}. Run \`npm run auth\` first.`,
    );
  }
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
  return oAuth2Client;
}

async function interactiveAuth() {
  const oAuth2Client = buildOAuthClient();
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  console.log("\nAuthorize this app by visiting:\n", authUrl, "\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) =>
    rl.question("Paste the code from that page here: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );

  const { tokens } = await oAuth2Client.getToken(code);
  const tokenPath = process.env.GMAIL_TOKEN_PATH || "./data/token.json";
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log(`\nSaved Gmail token to ${tokenPath}`);
}

if (require.main === module) {
  interactiveAuth().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { getAuthedClient, SCOPES };
