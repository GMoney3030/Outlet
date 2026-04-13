// Tiny JSON-file backed store. Every order keeps a createdAt timestamp so
// we can list them by date, plus a revisions[] array that snapshots every
// edit so we can reconstruct the conversation history with the customer.

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "..", "data", "orders.json");

function readAll() {
  if (!fs.existsSync(STORE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return [];
  }
}

function writeAll(orders) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(orders, null, 2));
}

function nextId() {
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

function createOrder(partial) {
  const now = new Date().toISOString();
  const order = {
    id: nextId(),
    createdAt: now,
    updatedAt: now,
    status: "draft",
    threadId: null,
    messageIds: [],
    revisions: [],
    pickupDate: null,
    ...partial,
  };
  const all = readAll();
  all.push(order);
  writeAll(all);
  return order;
}

function getOrder(id) {
  return readAll().find((o) => o.id === id) || null;
}

function updateOrder(id, patch) {
  const all = readAll();
  const idx = all.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  const prev = all[idx];
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  all[idx] = next;
  writeAll(all);
  return next;
}

function pushRevision(id, snapshot, note) {
  const order = getOrder(id);
  if (!order) return null;
  const revisions = order.revisions.concat({
    at: new Date().toISOString(),
    note: note || "",
    snapshot,
  });
  return updateOrder(id, { revisions });
}

function listOrders({ since } = {}) {
  const all = readAll();
  if (!since) return all;
  const cutoff = new Date(since).getTime();
  return all.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
}

function findByThreadId(threadId) {
  return readAll().find((o) => o.threadId === threadId) || null;
}

module.exports = {
  createOrder,
  getOrder,
  updateOrder,
  pushRevision,
  listOrders,
  findByThreadId,
};
