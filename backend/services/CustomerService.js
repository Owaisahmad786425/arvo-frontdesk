const { Customer } = require("../models");
const { field, fail } = require("../middleware/authMiddleware");
function validId(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    fail(400, "Invalid customer ID");
  return value;
}
async function upsert(name, email, transaction) {
  name = field(name, "customer name", 120);
  email = field(email, "customer email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(400, "Invalid customer email");
  const [contact] = await Customer.findOrCreate({
    where: { email },
    defaults: { name },
    transaction,
  });
  return contact;
}
module.exports = { upsert, validId };
