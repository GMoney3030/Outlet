// Very small, deterministic natural-language parser for customer replies.
// This is intentionally conservative — if we can't confidently parse a
// change, we leave the order alone and flag it for human review.
//
// Supported commands (case-insensitive, one per line or sentence):
//   "approve" / "confirmed" / "looks good" / "lgtm"  → confirm
//   "add N cases of <item>" / "add N <item>"         → +N (× caseSize if "cases")
//   "remove <item>" / "drop <item>" / "no <item>"    → delete line
//   "change <item> to N"                             → set quantity
//   "more <item>" / "less <item>"                    → ±1

const APPROVE_RE = /\b(approve|confirmed?|locked? in|looks good|lgtm|perfect|that works)\b/i;

function matchItem(lineItems, query) {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  // exact name hit
  let hit = lineItems.find((li) => li.name.toLowerCase() === q);
  if (hit) return hit;
  // name contains
  hit = lineItems.find((li) => li.name.toLowerCase().includes(q));
  if (hit) return hit;
  // category hit
  hit = lineItems.find((li) => li.category.toLowerCase() === q || li.category.toLowerCase().includes(q));
  if (hit) return hit;
  // word overlap
  const words = q.split(/\s+/).filter(Boolean);
  hit = lineItems.find((li) => words.every((w) => (li.name + " " + li.category).toLowerCase().includes(w)));
  return hit || null;
}

// Look up a product by free-text name in the full catalog so we can add
// brand-new line items the customer asks for.
function matchCatalog(products, query) {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  let hit = products.find((p) => p.name.toLowerCase() === q);
  if (hit) return hit;
  hit = products.find((p) => p.name.toLowerCase().includes(q));
  if (hit) return hit;
  hit = products.find((p) => p.category.toLowerCase().includes(q));
  if (hit) return hit;
  const words = q.split(/\s+/).filter(Boolean);
  return (
    products.find((p) => words.every((w) => (p.name + " " + p.category).toLowerCase().includes(w))) ||
    null
  );
}

function parseReply(text, order, { products = [] } = {}) {
  const lineItems = order.lineItems.map((li) => ({ ...li }));
  const actions = [];
  const unresolved = [];
  const confirmed = APPROVE_RE.test(text);

  // Split on line-breaks and sentence punctuation, and drop any trailing
  // punctuation on each fragment so regexes below don't have to care.
  const chunks = text
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/[.!?,;:]+$/g, "").trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    let m;

    if ((m = chunk.match(/^add\s+(\d+)\s+(cases|case|bottles|bottle)?\s*(?:of\s+)?(.+)$/i))) {
      const n = Number(m[1]);
      const isCase = /case/i.test(m[2] || "");
      const target = matchItem(lineItems, m[3]);
      if (target) {
        const delta = isCase ? n * (target.caseSize || 12) : n;
        target.quantity += delta;
        actions.push(`added ${delta}× ${target.name}`);
      } else {
        // Not already on the order — try to pull it from the catalog.
        const fresh = matchCatalog(products, m[3]);
        if (fresh) {
          const delta = isCase ? n * (fresh.caseSize || 12) : n;
          lineItems.push({
            sku: fresh.sku,
            name: fresh.name,
            category: fresh.category,
            unitPrice: fresh.unitPrice,
            caseSize: fresh.caseSize || 12,
            quantity: delta,
          });
          actions.push(`added new line: ${delta}× ${fresh.name}`);
        } else {
          unresolved.push(`could not find product to add: "${m[3]}"`);
        }
      }
      continue;
    }

    if ((m = chunk.match(/^(remove|drop|delete|no)\s+(the\s+)?(.+)$/i))) {
      const target = matchItem(lineItems, m[3]);
      if (target) {
        const idx = lineItems.indexOf(target);
        lineItems.splice(idx, 1);
        actions.push(`removed ${target.name}`);
      } else {
        unresolved.push(`could not find product to remove: "${m[3]}"`);
      }
      continue;
    }

    if ((m = chunk.match(/^change\s+(.+?)\s+to\s+(\d+)(\s+cases?|\s+bottles?)?$/i))) {
      const target = matchItem(lineItems, m[1]);
      const n = Number(m[2]);
      const isCase = /case/i.test(m[3] || "");
      if (target) {
        target.quantity = isCase ? n * (target.caseSize || 12) : n;
        actions.push(`set ${target.name} to ${target.quantity}`);
      } else {
        unresolved.push(`could not find product to change: "${m[1]}"`);
      }
      continue;
    }

    if ((m = chunk.match(/^more\s+(.+)$/i))) {
      const target = matchItem(lineItems, m[1]);
      if (target) {
        target.quantity += 1;
        actions.push(`+1 ${target.name}`);
      }
      continue;
    }

    if ((m = chunk.match(/^less\s+(.+)$/i))) {
      const target = matchItem(lineItems, m[1]);
      if (target && target.quantity > 1) {
        target.quantity -= 1;
        actions.push(`-1 ${target.name}`);
      }
      continue;
    }
  }

  // Drop any lines whose quantity went to zero or below.
  const filtered = lineItems.filter((li) => li.quantity > 0);

  return {
    confirmed,
    actions,
    unresolved,
    lineItems: filtered,
    changed: actions.length > 0,
  };
}

module.exports = { parseReply };
