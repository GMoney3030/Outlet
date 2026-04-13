const form = document.getElementById("order-form");
const result = document.getElementById("result");
const resultSummary = document.getElementById("result-summary");
const resultOrder = document.getElementById("result-order");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  button.textContent = "Drafting...";

  const data = Object.fromEntries(new FormData(form).entries());
  data.guestCount = Number(data.guestCount);

  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Request failed");

    resultSummary.textContent = `Order ${body.order.id} created on ${new Date(
      body.order.createdAt,
    ).toLocaleString()}. An email draft has been sent to ${
      body.order.customer.email || "the address on file"
    }.`;
    resultOrder.textContent = body.emailPreview;
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    alert("Sorry, we couldn't draft your order: " + err.message);
  } finally {
    button.disabled = false;
    button.textContent = "Draft my order";
  }
});
