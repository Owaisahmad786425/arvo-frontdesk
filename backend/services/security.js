const {
  randomBytes,
  createHash,
  scrypt,
  timingSafeEqual,
} = require("node:crypto");
const { promisify } = require("node:util");
const derive = promisify(scrypt);
const token = () => randomBytes(32).toString("hex");
const digest = (s) => createHash("sha256").update(s).digest("hex");
async function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  return salt + "." + (await derive(value, salt, 64)).toString("hex");
}
async function verify(value, hash) {
  const [salt, expected] = hash.split(".");
  return timingSafeEqual(
    await derive(value, salt, 64),
    Buffer.from(expected, "hex"),
  );
}
module.exports = { token, digest, verify, hashPassword };
