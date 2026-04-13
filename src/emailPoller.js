// Polls Gmail for new customer replies on every open order and updates the
// order accordingly.
//
// Run once:           node src/emailPoller.js
// Run in a loop:      node src/emailPoller.js --watch
//
// Cron (every 5 min): */5 * * * * cd /path/to/Outlet && node src/emailPoller.js

require("dotenv").config();

const { listOrders, getOrder } = require("./orderStore");
const { processReply } = require("./orderFlow");
const { fetchNewReplies } = require("./emailService");

async function runOnce() {
  const open = listOrders().filter(
    (o) => o.threadId && o.status !== "confirmed" && o.status !== "ready",
  );

  for (const order of open) {
    try {
      const replies = await fetchNewReplies(order.threadId);
      for (const reply of replies) {
        console.log(`[poller] ${order.id} got reply from ${reply.from}`);
        const updated = await processReply(order.id, reply.text, {
          messageId: reply.messageId,
          references: reply.references,
        });
        console.log(`[poller] ${order.id} → ${updated.status}`);
      }
    } catch (err) {
      console.warn(`[poller] ${order.id} failed:`, err.message);
    }
  }
}

async function main() {
  if (process.argv.includes("--watch")) {
    const intervalMs = Number(process.env.POLL_INTERVAL_MS || 60000);
    console.log(`[poller] watching every ${intervalMs}ms`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await runOnce();
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  } else {
    await runOnce();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runOnce };
