import fs from "node:fs/promises";
import { buildEventOffers, buildEventPriceCopy } from "../public/assets/js/festa60-event-schema.js";

const file = process.argv[2];
if (!file) throw new Error("Pass the FESTA homepage HTML path");
const now = new Date();
let html = await fs.readFile(file, "utf8");
const schemaPattern = /(<script\b[^>]*id="festa60-event-schema"[^>]*>)([\s\S]*?)(<\/script>)/;
if (!schemaPattern.test(html)) throw new Error("FESTA Event schema is missing");
html = html.replace(schemaPattern, (_, open, json, close) => {
  const event = JSON.parse(json);
  const offers = buildEventOffers(now);
  if (offers.length) event.offers = offers;
  else delete event.offers;
  const formatted = JSON.stringify(event, null, 2).split("\n").map((line) => `      ${line}`).join("\n");
  return `${open}\n${formatted}\n    ${close}`;
});
const copy = buildEventPriceCopy(now);
for (const [tag, attribute, text] of [
  ["h3", "data-event-price-heading", copy.heading],
  ["p", "data-event-price-example", copy.example],
]) {
  const pattern = new RegExp(`(<${tag}\\b[^>]*${attribute}[^>]*>)[\\s\\S]*?(</${tag}>)`);
  if (!pattern.test(html)) throw new Error(`Missing ${attribute}`);
  html = html.replace(pattern, (_, open, close) => `${open}${text}${close}`);
}
await fs.writeFile(file, html);
