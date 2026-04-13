// Translates a questionnaire response into a concrete wedding order.
//
// The philosophy: serve ~1.5 drinks per guest per hour for a ~4 hour
// reception (≈ 6 drinks/guest). We split that mix across whatever the
// customer asked for, mapping their free-text preferences to catalog
// categories, then translate drink counts into bottles/cases using
// sensible defaults per category.

const { findByCategory, pickCheapest } = require("./scraper");

const DRINKS_PER_GUEST = 6;

// How many servings a single unit (bottle / 24-pack) yields.
const SERVINGS_PER_UNIT = {
  "red wine": 5,
  "white wine": 5,
  "rosé": 5,
  "champagne": 6,
  "sparkling": 6,
  "beer": 24,         // 24-pack
  "vodka": 39,        // 1.75L → ~39 × 1.5oz pours
  "gin": 39,
  "tequila": 39,
  "whiskey": 39,
  "rum": 39,
};

// Aliases the customer might type → catalog category.
const PREFERENCE_ALIASES = [
  [/red wine|cabernet|merlot|pinot noir|malbec|syrah|shiraz|red/i, "red wine"],
  [/white wine|chardonnay|sauvignon blanc|pinot grigio|riesling|white/i, "white wine"],
  [/ros[eé]/i, "rosé"],
  [/champagne|bubbly|sparkling|prosecco|cava/i, "champagne"],
  [/beer|lager|ipa|ale|pilsner/i, "beer"],
  [/vodka/i, "vodka"],
  [/gin/i, "gin"],
  [/tequila|mezcal/i, "tequila"],
  [/whisk(e)?y|bourbon|scotch|rye/i, "whiskey"],
  [/rum/i, "rum"],
];

function parsePreferences(text) {
  const hits = new Set();
  for (const [re, category] of PREFERENCE_ALIASES) {
    if (re.test(text)) hits.add(category);
  }
  // If nothing matched, default to a safe house mix.
  if (!hits.size) {
    ["red wine", "white wine", "champagne", "beer"].forEach((c) => hits.add(c));
  }
  return Array.from(hits);
}

function splitServings(totalServings, categories) {
  // Distribute servings with a small bias toward wine + beer as house staples.
  const weights = categories.map((c) => {
    if (c === "red wine" || c === "white wine") return 2;
    if (c === "beer") return 2;
    if (c === "champagne") return 1; // champagne is mostly for the toast
    return 1;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  return categories.map((c, i) => ({
    category: c,
    servings: Math.round((totalServings * weights[i]) / total),
  }));
}

function chooseProduct(products, category) {
  // Prefer an exact category match, fall back to a related one.
  const fallbacks = {
    "sparkling": ["champagne"],
    "champagne": ["sparkling"],
  };
  const product = pickCheapest(products, category, fallbacks[category] || []);
  if (product) return product;
  // last-resort placeholder so the order is never silently empty
  return {
    sku: `TBD-${category.toUpperCase().replace(/\s+/g, "-")}`,
    name: `TBD — ${category}`,
    category,
    unitPrice: 0,
    caseSize: 12,
  };
}

function buildLineItems(products, guestCount, preferenceText) {
  const categories = parsePreferences(preferenceText);
  const totalServings = guestCount * DRINKS_PER_GUEST;
  const split = splitServings(totalServings, categories);

  return split.map(({ category, servings }) => {
    const product = chooseProduct(products, category);
    const perUnit = SERVINGS_PER_UNIT[category] || 5;
    const quantity = Math.max(1, Math.ceil(servings / perUnit));
    return {
      sku: product.sku,
      name: product.name,
      category,
      unitPrice: product.unitPrice,
      caseSize: product.caseSize || 12,
      quantity,
      servingsCovered: quantity * perUnit,
    };
  });
}

function buildOrder({ contact, guestCount, liquorPreferences, products }) {
  const lineItems = buildLineItems(products, guestCount, liquorPreferences);
  return {
    customer: contact,
    wedding: {
      guestCount,
      liquorPreferences,
      preferenceCategories: parsePreferences(liquorPreferences),
    },
    lineItems,
  };
}

module.exports = { buildOrder, buildLineItems, parsePreferences, DRINKS_PER_GUEST };
