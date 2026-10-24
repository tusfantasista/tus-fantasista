import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { buildEventOffers, buildEventPriceCopy, refreshEventSchema } from "../public/assets/js/festa60-event-schema.js";
import { ticketLineAmount, feePeriodForDate, CURRENT_PRICING_VERSION } from "../public/assets/js/festa60-pricing.js";

const home = await fs.readFile("public/festa-60th/index.html", "utf8");
const program = await fs.readFile("public/festa-60th/program/index.html", "utf8");
const getEvent = (html) => JSON.parse(html.match(/<script\b[^>]*id="festa60-event-schema"[^>]*>([\s\S]*?)<\/script>/)[1]);
const event = getEvent(home);
assert.deepEqual(event.performer.map((performer) => performer.name), [
  "若代愼・辰巳友莉亜組", "寺門駿・寺門彩香組", "飯塚隆嗣・有村玲音組", "矢嶋太門・下垣内咲帆組", "伊藤裕貴・柳下真嬉組",
]);
for (const performer of event.performer) {
  assert.equal(performer["@type"], "PerformingGroup");
  assert(home.slice(home.indexOf("<body")).includes(performer.name), "Performer is visible on the Event page");
  assert(program.includes(performer.name), "Performer agrees with the published program");
}

const cohorts = ["obog_5_under", "obog_6_10", "obog"];
const receptions = ["attending", "without_reception"];
// Independent expected fees at Japan-time boundaries, including the application deadline.
const cases = [
  ["2026-10-13T12:00:00+09:00", [9000, 5000, 11000, 7000, 13000, 9000], "2026-10-31"],
  ["2026-10-31T23:59:59+09:00", [9000, 5000, 11000, 7000, 13000, 9000], "2026-10-31"],
  ["2026-11-01T00:00:00+09:00", [10000, 6000, 12000, 8000, 14000, 10000], "2026-12-31"],
  ["2026-12-31T23:59:59+09:00", [10000, 6000, 12000, 8000, 14000, 10000], "2026-12-31"],
  ["2027-01-01T00:00:00+09:00", [11000, 7000, 13000, 9000, 15000, 11000], "2027-01-31"],
  ["2027-01-31T23:59:59+09:00", [11000, 7000, 13000, 9000, 15000, 11000], "2027-01-31"],
];
const schemaElement = { textContent: JSON.stringify(event) };
const headingElement = { innerHTML: "" };
const exampleElement = { textContent: "" };
const attendingElement = { textContent: "" };
const festaOnlyElement = { textContent: "" };
const elements = {
  "#festa60-event-schema": schemaElement,
  "[data-event-price-heading]": headingElement,
  "[data-event-price-example]": exampleElement,
  "[data-event-price-attending]": attendingElement,
  "[data-event-price-festa-only]": festaOnlyElement,
};
const scope = { querySelector: (selector) => elements[selector] };
for (const [date, prices, expiry] of cases) {
  const now = new Date(date);
  const offers = buildEventOffers(now);
  assert.deepEqual(offers.map((offer) => offer.price), prices, date);
  assert.equal(new Set(offers.map((offer) => offer.name)).size, 6);
  for (const [i, offer] of offers.entries()) {
    assert.equal(offer["@type"], "Offer");
    assert.equal(offer.priceCurrency, "JPY");
    assert.equal(offer.availability, "https://schema.org/InStock");
    assert.equal(offer.priceValidUntil, expiry);
    assert.equal(offer.validThrough, `${expiry}T23:59:59+09:00`);
    assert.equal(offer.url, "https://tus-fantasista-festa60.pages.dev/festa60-register/");
    assert(home.includes('href="../festa60-register/"'), "Purchase URL is linked from the Event page");
    assert.equal(offer.price, ticketLineAmount(cohorts[Math.floor(i / 2)], feePeriodForDate(now), receptions[i % 2], CURRENT_PRICING_VERSION), "Schema agrees with checkout prices");
    assert.equal(offer.validFrom, "2026-08-30", "Sale opening date agrees with the public announcement; no time invented");
  }
  refreshEventSchema(scope, now);
  const rendered = JSON.parse(schemaElement.textContent);
  assert.deepEqual(rendered.offers, offers, "JSON-LD changes at the same boundary as prices");
  assert.deepEqual(rendered.performer, event.performer, "Price refresh preserves performers");
  for (const key of ["@id", "name", "startDate", "endDate", "location", "organizer"]) {
    assert.deepEqual(rendered[key], event[key], `Price refresh preserves ${key}`);
  }
  const copy = buildEventPriceCopy(now);
  assert.equal(headingElement.innerHTML, copy.heading);
  assert.equal(exampleElement.textContent, copy.example);
  assert.equal(attendingElement.textContent, `${prices[0].toLocaleString("ja-JP")}〜${prices[4].toLocaleString("ja-JP")}円`, date);
  assert.equal(festaOnlyElement.textContent, `${prices[1].toLocaleString("ja-JP")}〜${prices[5].toLocaleString("ja-JP")}円`, date);
  assert(exampleElement.textContent.includes(`${prices[0].toLocaleString("ja-JP")}円`));
  assert(exampleElement.textContent.includes(`${prices[1].toLocaleString("ja-JP")}円`));
}
for (const now of [new Date("2027-02-01T00:00:00+09:00"), new Date("invalid")]) {
  refreshEventSchema(scope, now);
  assert(!Object.hasOwn(JSON.parse(schemaElement.textContent), "offers"), "Closed or unknown time must not advertise purchasable tickets");
  assert(headingElement.innerHTML.includes("終了"));
  assert.equal(attendingElement.textContent, "受付終了");
  assert.equal(festaOnlyElement.textContent, "受付終了");
}

const production = await fs.readFile("festa60-public/festa-60th/index.html", "utf8");
assert.deepEqual(getEvent(production).offers, buildEventOffers(), "Build includes current prices without needing JavaScript");
assert.deepEqual(getEvent(production).performer, event.performer);
for (const [attribute, value] of [["attending", buildEventPriceCopy().attending], ["festa-only", buildEventPriceCopy().festaOnly]]) {
  assert(production.includes(`data-event-price-${attribute}>${value}</strong>`), "Built page includes the current fee range without JavaScript");
}
const robots = await fs.readFile("festa60-public/robots.txt", "utf8");
assert(!/^Disallow:\s*\/festa60-register\/?\s*$/m.test(robots), "Google can crawl offers.url");
assert(robots.includes("Disallow: /api/"), "API crawl restriction preserved");
const register = await fs.readFile("festa60-public/festa60-register/index.html", "utf8");
assert(register.includes('content="noindex,nofollow"'), "Registration stays out of search results");
console.log("PASS FESTA Event: 5 published groups, 6 conditional offers, JST price/deadline boundaries, build fallback, crawlable noindex registration");
