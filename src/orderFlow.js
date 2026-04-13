// The order-lifecycle orchestrator. Both the HTTP server and the email
// poller call into here so the state machine lives in exactly one place.
//
//   draft → sent → (revision → sent)* → confirmed (pickup scheduled)
//
// Any step that changes the order appends a revision snapshot so we have
// a full audit trail against the createdAt timestamp.

const { fetchProducts } = require("./scraper");
const { buildOrder } = require("./orderBuilder");
const { applyDiscounts } = require("./discounts");
const { parseContact } = require("./contactParser");
const { parseReply } = require("./replyParser");
const { renderOrderBody, renderSubject } = require("./emailTemplate");
const { sendEmail } = require("./emailService");
const { computePickupDate } = require("./pickupScheduler");
const {
  createOrder,
  updateOrder,
  getOrder,
  pushRevision,
} = require("./orderStore");

async function createDraftOrder({ contact: rawContact, guestCount, liquorPreferences }) {
  const contact = parseContact(rawContact);
  const products = await fetchProducts();
  const base = buildOrder({
    contact,
    guestCount: Number(guestCount),
    liquorPreferences,
    products,
  });
  const priced = applyDiscounts(base);

  const order = createOrder({
    ...priced,
    status: "draft",
    contactRaw: rawContact,
  });

  const subject = renderSubject(order, { kind: "draft" });
  const body = renderOrderBody(order, { kind: "draft" });

  const sendRes = await sendEmail({
    to: contact.email,
    subject,
    body,
  });

  const patched = updateOrder(order.id, {
    status: sendRes.dryRun ? "draft" : "sent",
    threadId: sendRes.threadId || null,
    messageIds: sendRes.id ? [sendRes.id] : [],
    lastSubject: subject,
  });
  pushRevision(order.id, snapshotOf(patched), "initial draft");
  return { order: patched, emailPreview: `${subject}\n\n${body}` };
}

async function processReply(orderId, replyText, { messageId, references } = {}) {
  const order = getOrder(orderId);
  if (!order) throw new Error(`order ${orderId} not found`);

  const products = await fetchProducts();
  const parsed = parseReply(replyText, order, { products });

  // Customer confirmed — lock it in and schedule pickup.
  if (parsed.confirmed && !parsed.changed) {
    const pickupDate = computePickupDate();
    const confirmed = updateOrder(orderId, {
      status: "confirmed",
      pickupDate,
    });
    const subject = renderSubject(confirmed, { kind: "confirmation" });
    const body = renderOrderBody(confirmed, { kind: "confirmation" });
    const sendRes = await sendEmail({
      to: confirmed.customer.email,
      subject,
      body,
      threadId: confirmed.threadId,
      inReplyTo: messageId,
      references: [references, messageId].filter(Boolean).join(" "),
    });
    const finalOrder = updateOrder(orderId, {
      status: sendRes.dryRun ? "confirmed" : "ready",
      messageIds: [...(confirmed.messageIds || []), sendRes.id].filter(Boolean),
      lastSubject: subject,
    });
    pushRevision(orderId, snapshotOf(finalOrder), "confirmed + pickup scheduled");
    return finalOrder;
  }

  // Otherwise, rebuild the order with the parsed edits and send a revision.
  const revised = applyDiscounts({
    ...order,
    lineItems: parsed.lineItems,
  });
  const patched = updateOrder(orderId, {
    ...revised,
    status: "revised",
  });
  const subject = renderSubject(patched, { kind: "revision" });
  const body =
    renderOrderBody(patched, { kind: "revision" }) +
    (parsed.unresolved.length
      ? `\n\nNote — I couldn't parse these changes, could you clarify?\n  - ${parsed.unresolved.join(
          "\n  - ",
        )}`
      : "");

  const sendRes = await sendEmail({
    to: patched.customer.email,
    subject,
    body,
    threadId: patched.threadId,
    inReplyTo: messageId,
    references: [references, messageId].filter(Boolean).join(" "),
  });

  const finalOrder = updateOrder(orderId, {
    status: sendRes.dryRun ? "revised" : "sent",
    messageIds: [...(patched.messageIds || []), sendRes.id].filter(Boolean),
    lastSubject: subject,
  });
  pushRevision(
    orderId,
    snapshotOf(finalOrder),
    `applied: ${parsed.actions.join("; ") || "(none)"}`,
  );
  return finalOrder;
}

function snapshotOf(order) {
  return {
    status: order.status,
    lineItems: order.lineItems,
    totals: order.totals,
    pickupDate: order.pickupDate,
  };
}

module.exports = { createDraftOrder, processReply };
