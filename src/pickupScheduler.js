// Pickup date = today + PICKUP_LEAD_DAYS, rolled forward to the next
// non-Sunday (most liquor stores are closed on Sundays in many states).

function computePickupDate(fromDate = new Date()) {
  const leadDays = Number(process.env.PICKUP_LEAD_DAYS || 7);
  const d = new Date(fromDate);
  d.setDate(d.getDate() + leadDays);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

function formatPickupDate(iso) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

module.exports = { computePickupDate, formatPickupDate };
