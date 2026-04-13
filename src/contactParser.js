// Parses the free-text "Name, Email, and/or Number" field into structured
// pieces. The form intentionally accepts a blob so customers can type
// whatever they have handy.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\(?\d[\d\s().-]{7,}\d)/;

function parseContact(raw) {
  const text = String(raw || "").trim();
  if (!text) return { name: "", email: "", phone: "" };

  const email = (text.match(EMAIL_RE) || [""])[0];
  const phone = (text.match(PHONE_RE) || [""])[0];

  let name = text;
  if (email) name = name.replace(email, "");
  if (phone) name = name.replace(phone, "");
  name = name
    .replace(/[,;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // drop any orphan punctuation/parens left from the stripping above
    .replace(/^[-,;:()]+|[-,;:()]+$/g, "")
    .trim();

  return { name, email, phone };
}

module.exports = { parseContact };
