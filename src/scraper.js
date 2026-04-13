// Fetches product intel from the Outlet Liquors website.
//
// The scraper is deliberately generic: it pulls the configured catalog page
// and extracts products using a few common e-commerce patterns (WooCommerce,
// Shopify, generic product cards). Results are cached to disk so the rest of
// the app can keep working if the site is slow or temporarily unreachable.
//
// If the site isn't reachable at all, a small hand-curated fallback catalog
// is returned so you can still exercise the full order-drafting flow during
// local development. Replace or extend this fallback with whatever Outlet
// Liquors actually stocks.

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const CACHE_PATH = path.join(__dirname, "..", "data", "catalog-cache.json");

const FALLBACK_CATALOG = [
  { sku: "RW-CAB-001", name: "House Cabernet Sauvignon", category: "red wine", unitPrice: 14.99, caseSize: 12 },
  { sku: "RW-PIN-002", name: "Willamette Pinot Noir", category: "red wine", unitPrice: 19.99, caseSize: 12 },
  { sku: "WW-CHA-001", name: "Sonoma Chardonnay", category: "white wine", unitPrice: 15.99, caseSize: 12 },
  { sku: "WW-SAV-002", name: "Marlborough Sauvignon Blanc", category: "white wine", unitPrice: 13.99, caseSize: 12 },
  { sku: "RO-PRV-001", name: "Provence Rosé", category: "rosé", unitPrice: 16.99, caseSize: 12 },
  { sku: "CH-BRU-001", name: "Brut Champagne", category: "champagne", unitPrice: 24.99, caseSize: 12 },
  { sku: "CH-PRS-002", name: "Prosecco", category: "sparkling", unitPrice: 12.99, caseSize: 12 },
  { sku: "BE-LGT-001", name: "Local Light Lager (24-pack)", category: "beer", unitPrice: 22.99, caseSize: 1 },
  { sku: "BE-IPA-002", name: "Craft IPA (24-pack)", category: "beer", unitPrice: 29.99, caseSize: 1 },
  { sku: "SP-VOD-001", name: "House Vodka 1.75L", category: "vodka", unitPrice: 21.99, caseSize: 6 },
  { sku: "SP-GIN-001", name: "London Dry Gin 1.75L", category: "gin", unitPrice: 26.99, caseSize: 6 },
  { sku: "SP-TEQ-001", name: "Blanco Tequila 1.75L", category: "tequila", unitPrice: 32.99, caseSize: 6 },
  { sku: "SP-WHI-001", name: "Bourbon Whiskey 1.75L", category: "whiskey", unitPrice: 34.99, caseSize: 6 },
  { sku: "SP-RUM-001", name: "White Rum 1.75L", category: "rum", unitPrice: 22.99, caseSize: 6 },
];

function cacheFresh() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  const ttlMinutes = Number(process.env.CATALOG_CACHE_TTL_MINUTES || 60);
  const stat = fs.statSync(CACHE_PATH);
  const ageMinutes = (Date.now() - stat.mtimeMs) / 60000;
  if (ageMinutes > ttlMinutes) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(products) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(products, null, 2));
}

function parsePrice(text) {
  if (!text) return null;
  const match = String(text).replace(/,/g, "").match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/champagne|prosecco|sparkling|cava/.test(n)) return "champagne";
  if (/cabernet|merlot|pinot noir|malbec|syrah|shiraz|zinfandel|red blend/.test(n)) return "red wine";
  if (/chardonnay|sauvignon blanc|riesling|pinot grigio|pinot gris|white/.test(n)) return "white wine";
  if (/ros[eé]/.test(n)) return "rosé";
  if (/ipa|lager|ale|stout|pilsner|beer/.test(n)) return "beer";
  if (/vodka/.test(n)) return "vodka";
  if (/gin/.test(n)) return "gin";
  if (/tequila|mezcal/.test(n)) return "tequila";
  if (/whisk(e)?y|bourbon|scotch|rye/.test(n)) return "whiskey";
  if (/rum/.test(n)) return "rum";
  return "other";
}

function extractFromHtml(html) {
  const $ = cheerio.load(html);
  const products = [];

  // Try a handful of common product-card selectors. Whichever yields the most
  // complete rows wins.
  const selectors = [
    "li.product",                       // WooCommerce
    ".product-card",                    // generic
    ".product-item",                    // Shopify/generic
    "[data-product-id]",                // data-attr driven
    ".grid-product",                    // Shopify Debut-ish
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const node = $(el);
      const name =
        node.find(".woocommerce-loop-product__title, .product-title, h2, h3, .name").first().text().trim() ||
        node.find("a").first().attr("title");
      const priceText =
        node.find(".price .amount, .price, .product-price, [data-price]").first().text() ||
        node.find("[data-price]").attr("data-price");
      const price = parsePrice(priceText);
      if (name && price) {
        products.push({
          sku: node.attr("data-product-id") || `SCR-${products.length + 1}`,
          name,
          category: guessCategory(name),
          unitPrice: price,
          caseSize: 12,
        });
      }
    });
    if (products.length >= 5) break;
  }

  return products;
}

async function fetchProducts({ force = false } = {}) {
  if (!force) {
    const cached = cacheFresh();
    if (cached && cached.length) return cached;
  }

  const base = process.env.OUTLET_LIQUORS_URL;
  const pathPart = process.env.OUTLET_LIQUORS_CATALOG_PATH || "/shop";
  if (!base) {
    return FALLBACK_CATALOG;
  }

  try {
    const url = base.replace(/\/$/, "") + pathPart;
    const res = await axios.get(url, {
      timeout: 15000,
      headers: { "User-Agent": "OutletWeddingOrdersBot/0.1" },
    });
    const products = extractFromHtml(res.data);
    if (products.length) {
      writeCache(products);
      return products;
    }
    console.warn("[scraper] No products parsed from", url, "- using fallback catalog");
    return FALLBACK_CATALOG;
  } catch (err) {
    console.warn("[scraper] Fetch failed:", err.message, "- using fallback catalog");
    return FALLBACK_CATALOG;
  }
}

function findByCategory(products, category) {
  return products.filter((p) => p.category === category);
}

function pickCheapest(products, category, fallbackCategories = []) {
  const tiers = [category, ...fallbackCategories];
  for (const c of tiers) {
    const matches = findByCategory(products, c).sort((a, b) => a.unitPrice - b.unitPrice);
    if (matches.length) return matches[0];
  }
  return null;
}

module.exports = { fetchProducts, findByCategory, pickCheapest, FALLBACK_CATALOG };
