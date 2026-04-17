// Renders an order into plain-text email bodies. We keep this in one place
// so the initial draft, every revision, and the final confirmation all look
// consistent.

const { formatPickupDate } = require("./pickupScheduler");

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

function renderLineTable(lineItems) {
  const rows = lineItems.map((li) => {
    const qtyLabel = `${li.quantity} × ${li.name}`;
    const price = money(li.lineGross);
    const discount = li.caseDiscountApplied ? `  (-${money(li.caseDiscount)} case)` : "";
    return `  • ${qtyLabel.padEnd(42)} ${price}${discount}`;
  });
  return rows.join("\n");
}

function renderOrderBody(order, { kind = "draft" } = {}) {
  const t = order.totals;
  const who = order.customer.name || "there";
  const lines = [];

  if (kind === "draft") {
    lines.push(
      `Hi ${who},`,
      "",
      `Thanks for letting Outlet Liquors help stock your wedding! Based on a`,
      `head count of ${order.wedding.guestCount} and a preference for`,
      `${order.wedding.preferenceCategories.join(", ")}, here's a first draft:`,
    );
  } else if (kind === "revision") {
    lines.push(
      `Hi ${who},`,
      "",
      `Here's the updated draft reflecting your latest changes:`,
    );
  } else if (kind === "confirmation") {
    lines.push(
      `Hi ${who},`,
      "",
      `Your wedding order is locked in — thank you! Summary below.`,
    );
  }

  lines.push(
    "",
    renderLineTable(order.lineItems),
    "",
    `Subtotal:                                   ${money(t.subtotal)}`,
  );

  if (t.caseDiscount > 0) {
    lines.push(
      `Wine case discount (${t.caseDiscountPercent}% on 6+ bottles):       -${money(t.caseDiscount)}`,
    );
  }
  if (t.weddingDiscountApplied) {
    lines.push(
      `Wedding discount (${t.weddingDiscountPercent}% off, ${t.weddingDiscountMinGuests}+ guests):   -${money(t.weddingDiscount)}`,
    );
  }
  lines.push(
    `-----------------------------------------`,
    `Total:                                      ${money(t.total)}`,
    "",
  );

  if (kind === "confirmation" && order.pickupDate) {
    lines.push(
      `Pickup: ${formatPickupDate(order.pickupDate)}`,
      `Location: Outlet Liquors`,
      "",
      `If anything changes before pickup, just reply to this thread.`,
    );
  } else {
    lines.push(
      `Reply to this email with any changes — for example:`,
      `  • "add 2 cases of pinot noir"`,
      `  • "remove the tequila"`,
      `  • "change champagne to 3 bottles"`,
      ``,
      `When it looks right, just reply "approve" or "confirmed" and we'll`,
      `lock it in and send a pickup date.`,
    );
  }

  lines.push("", "— Outlet Liquors");
  return lines.join("\n");
}

function renderSubject(order, { kind = "draft" } = {}) {
  const who = order.customer.name || "Your";
  if (kind === "confirmation") {
    return `[Outlet Liquors] ${who} wedding order confirmed — pickup details inside`;
  }
  if (kind === "revision") {
    return `[Outlet Liquors] Revised wedding order draft (${order.id})`;
  }
  return `[Outlet Liquors] Wedding order draft (${order.id})`;
}

module.exports = { renderOrderBody, renderSubject };
