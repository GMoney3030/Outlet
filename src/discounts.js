// Discount engine.
//
//  • Case discount: when the quantity of a single SKU meets CASE_SIZE,
//    that line gets CASE_DISCOUNT_PERCENT off. (Apply per line so mixed
//    orders still get partial case discounts.)
//  • Wedding discount: a flat WEDDING_DISCOUNT_PERCENT off the whole
//    subtotal when guest count is ≥ WEDDING_DISCOUNT_MIN_GUESTS.
//
// Both are additive and applied in that order.

function round2(n) {
  return Math.round(n * 100) / 100;
}

function applyDiscounts(order) {
  const caseSize = Number(process.env.CASE_SIZE || 12);
  const casePct = Number(process.env.CASE_DISCOUNT_PERCENT || 10);
  const weddingPct = Number(process.env.WEDDING_DISCOUNT_PERCENT || 15);
  const weddingMin = Number(process.env.WEDDING_DISCOUNT_MIN_GUESTS || 50);

  let subtotal = 0;
  let caseDiscountTotal = 0;

  const lineItems = order.lineItems.map((item) => {
    const unitsForDiscount = Math.floor(item.quantity / (item.caseSize || caseSize));
    const discountableUnits = unitsForDiscount * (item.caseSize || caseSize);
    const lineGross = round2(item.unitPrice * item.quantity);
    const lineCaseDiscount = round2(
      item.unitPrice * discountableUnits * (casePct / 100),
    );
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
