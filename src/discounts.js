// Discount engine.
//
//  Wine/champagne discounts (applied per line item):
//
//  1. Value wine discount — bottles priced under VALUE_WINE_THRESHOLD ($13.99):
//       • 3–5 bottles → $1 off per bottle
//       • 6+ bottles  → $2 off per bottle
//
//  2. Case discount — bottles priced ≥ $13.99:
//       • 6+ bottles  → CASE_DISCOUNT_PERCENT (5%) off
//
//  Only one of the two applies per line (whichever matches the price tier).
//
//  Wedding discount: flat WEDDING_DISCOUNT_PERCENT off the post-wine-discount
//  subtotal when guest count ≥ WEDDING_DISCOUNT_MIN_GUESTS. Stacks on top.

const WINE_CATEGORIES = new Set([
  "red wine", "white wine", "rosé", "champagne", "sparkling",
]);

const VALUE_WINE_THRESHOLD = 13.99;
const VALUE_WINE_DISCOUNT_3_5 = 1.00;
const VALUE_WINE_DISCOUNT_6_PLUS = 2.00;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function wineDiscount(item, casePct) {
  const isWine = WINE_CATEGORIES.has(item.category);
  if (!isWine) return { amount: 0, label: null };

  if (item.unitPrice < VALUE_WINE_THRESHOLD) {
    if (item.quantity >= 6) {
      return {
        amount: round2(VALUE_WINE_DISCOUNT_6_PLUS * item.quantity),
        label: `$${VALUE_WINE_DISCOUNT_6_PLUS} off/bottle`,
      };
    }
    if (item.quantity >= 3) {
      return {
        amount: round2(VALUE_WINE_DISCOUNT_3_5 * item.quantity),
        label: `$${VALUE_WINE_DISCOUNT_3_5} off/bottle`,
      };
    }
    return { amount: 0, label: null };
  }

  // $13.99+ wines: percentage case discount on 6+ bottles
  if (item.quantity >= 6) {
    return {
      amount: round2(item.unitPrice * item.quantity * (casePct / 100)),
      label: `${casePct}% case`,
    };
  }
  return { amount: 0, label: null };
}

function applyDiscounts(order) {
  const casePct = Number(process.env.CASE_DISCOUNT_PERCENT || 5);
  const weddingPct = Number(process.env.WEDDING_DISCOUNT_PERCENT || 15);
  const weddingMin = Number(process.env.WEDDING_DISCOUNT_MIN_GUESTS || 50);

  let subtotal = 0;
  let caseDiscountTotal = 0;

  const lineItems = order.lineItems.map((item) => {
    const lineGross = round2(item.unitPrice * item.quantity);
    const disc = wineDiscount(item, casePct);
    const lineCaseDiscount = disc.amount;
    const lineNet = round2(lineGross - lineCaseDiscount);

    subtotal += lineGross;
    caseDiscountTotal += lineCaseDiscount;

    return {
      ...item,
      lineGross,
      caseDiscount: lineCaseDiscount,
      caseDiscountApplied: lineCaseDiscount > 0,
      caseDiscountLabel: disc.label,
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
