// Gmail API wrapper used by both the server (outbound drafts) and the
// poller (reading customer replies). Falls back to a no-op logger when
// credentials aren't configured so local dev still works.

const fs = require("fs");
const { google } = require("googleapis");
const { getAuthedClient } = require("./gmailAuth");

let cachedGmail = null;

async function gmailClient() {
  if (cachedGmail) return cachedGmail;
  const auth = await getAuthedClient();
  cachedGmail = google.gmail({ version: "v1", auth });
  return cachedGmail;
}

function encodeMessage({ from, to, subject, body, threadHeaders = {} }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
  ];
  for (const [k, v] of Object.entries(threadHeaders)) {
    if (v) headers.push(`${k}: ${v}`);
  }
  const raw = headers.join("\r\n") + "\r\n\r\n" + body;
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendEmail({ to, subject, body, threadId = null, inReplyTo = null, references = null }) {
  const from = process.env.GMAIL_USER;
  if (!from || !to) {
    console.log("[email:dry-run] No GMAIL_USER or recipient; would have sent:");
    console.log(`  To: ${to}\n  Subject: ${subject}\n\n${body}\n`);
    return { dryRun: true };
  }

  let gmail;
  try {
    gmail = await gmailClient();
  } catch (err) {
    console.warn("[email:dry-run] Gmail not configured:", err.message);
    console.log(`  To: ${to}\n  Subject: ${subject}\n\n${body}\n`);
    return { dryRun: true };
  }

  const raw = encodeMessage({
    from,
    to,
    subject,
    body,
    threadHeaders: {
      "In-Reply-To": inReplyTo,
      References: references,
    },
  });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: threadId || undefined },
  });

  return {
    id: res.data.id,
    threadId: res.data.threadId,
  };
}

// Returns any unread customer replies on a given thread. We mark them read
// afterward so we don't process them again.
async function fetchNewReplies(threadId) {
  if (!threadId) return [];
  let gmail;
  try {
    gmail = await gmailClient();
  } catch {
    return [];
  }

  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const me = (process.env.GMAIL_USER || "").toLowerCase();
  const replies = [];

  for (const msg of thread.data.messages || []) {
    const headers = Object.fromEntries(
      (msg.payload.headers || []).map((h) => [h.name.toLowerCase(), h.value]),
    );
    const from = (headers.from || "").toLowerCase();
    if (me && from.includes(me)) continue; // our own send
    const labels = msg.labelIds || [];
    if (!labels.includes("UNREAD")) continue;

    const text = extractPlainText(msg.payload);
    replies.push({
      id: msg.id,
      from: headers.from,
      subject: headers.subject,
      messageId: headers["message-id"],
      references: headers.references,
      text,
    });

    // Mark as read so the next poll ignores it.
    await gmail.users.messages.modify({
      userId: "me",
      id: msg.id,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
  }

  return replies;
}

function extractPlainText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  for (const part of payload.parts || []) {
    const t = extractPlainText(part);
    if (t) return t;
  }
  return "";
}

module.exports = { sendEmail, fetchNewReplies };
