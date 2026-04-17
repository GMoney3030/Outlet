// Discount engine.
//
//  • Case discount (wine only): 5% off when buying a full case of 12
//    bottles OR a half-case of 6 bottles. Applied per line item.
//  • Wedding discount: a flat WEDDING_DISCOUNT_PERCENT off the whole
//    subtotal when guest count is ≥ WEDDING_DISCOUNT_MIN_GUESTS.
//
// Both are additive and applied in that order.

const WINE_CATEGORIES = new Set([
  "red wine", "white wine", "rosé", "champagne", "sparkling",
]);

function round2(n) {
  return Math.round(n * 100) / 100;
}

function applyDiscounts(order) {
  const casePct = Number(process.env.CASE_DISCOUNT_PERCENT || 5);
  const weddingPct = Number(process.env.WEDDING_DISCOUNT_PERCENT || 15);
  const weddingMin = Number(process.env.WEDDING_DISCOUNT_MIN_GUESTS || 50);

  let subtotal = 0;
  let caseDiscountTotal = 0;

  const lineItems = order.lineItems.map((item) => {
    const lineGross = round2(item.unitPrice * item.quantity);
    let lineCaseDiscount = 0;

    // Wine case discount: 5% when buying 6+ bottles (half-case or full case)
    const isWine = WINE_CATEGORIES.has(item.category);
    if (isWine && item.quantity >= 6) {
      lineCaseDiscount = round2(lineGross * (casePct / 100));
    }

    const lineNet = round2(lineGross - lineCaseDiscount);

    subtotal += lineGross;
    caseDiscountTotal += lineCaseDiscount;

    return {
      ...item,
      lineGross,
      caseDiscount: lineCaseDiscount,
      caseDiscountApplied: lineCaseDiscount > 0,
      lineNet,
    };
  });

  subtotal = round2(subtotal);
  caseDiscountTotal = round2(caseDiscountTotal);

  const postCase = round2(subtotal - caseDiscountTotal);
  const weddingApplied = order.wedding.guestCount >= weddingMin;
  const weddingDiscount = weddingApplied
    ? round2(postCase * (weddingPct / 100))
    : 0;
  const total = round2(postCase - weddingDiscount);

  return {
    ...order,
    lineItems,
    totals: {
      subtotal,
      caseDiscount: caseDiscountTotal,
      caseDiscountPercent: casePct,
      weddingDiscount,
      weddingDiscountPercent: weddingApplied ? weddingPct : 0,
      weddingDiscountApplied: weddingApplied,
      weddingDiscountMinGuests: weddingMin,
      total,
    },
  };
}

module.exports = { applyDiscounts };
