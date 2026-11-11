// 32 symbols: omit 0/O and 1/I so codes are easier to read and type.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomCouponCode() {
  const random = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return Array.from(random, (byte) => ALPHABET[byte & 31]).join("");
}
