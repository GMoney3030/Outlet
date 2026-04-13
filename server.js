// Express server for the wedding order questionnaire.
//
//   GET  /                      → questionnaire form
//   POST /api/orders            → submit the form, draft + email an order
//   GET  /api/orders            → list every order tracked with createdAt
//   GET  /api/orders/:id        → show one order (incl. revision history)
//   POST /api/orders/:id/reply  → simulate a customer reply (for testing
//                                 without actually routing through Gmail)

require("dotenv").config();

const path = require("path");
const express = require("express");

const { createDraftOrder, processReply } = require("./src/orderFlow");
const { listOrders, getOrder } = require("./src/orderStore");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/orders", async (req, res) => {
  try {
    const { contact, guestCount, liquorPreferences } = req.body || {};
    if (!contact || !guestCount || !liquorPreferences) {
      return res
        .status(400)
        .json({ error: "contact, guestCount and liquorPreferences are required" });
    }
    const result = await createDraftOrder({ contact, guestCount, liquorPreferences });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/orders", (req, res) => {
  res.json({ orders: listOrders({ since: req.query.since }) });
});

app.get("/api/orders/:id", (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "not found" });
  res.json({ order });
});

app.post("/api/orders/:id/reply", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: "text is required" });
    const order = await processReply(req.params.id, text, {});
    res.json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Outlet wedding order server listening on http://localhost:${port}`);
});
