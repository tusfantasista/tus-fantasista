import { readFile } from "node:fs/promises";

const expectedApiRoutes = [
  "/api/contact",
  "/api/festa60/admin/applications",
  "/api/festa60/admin/applications/*",
  "/api/festa60/admin/export",
  "/api/festa60/admin/import",
  "/api/festa60/admin/video-stats",
  "/api/festa60/admin/page-stats",
  "/api/festa60/admin/coupons",
  "/api/festa60/admin/coupons/*",
  "/api/festa60/stripe/webhook",
  "/api/festa60/applications",
  "/api/festa60/config",
  "/api/festa60/coupon",
  "/api/festa60/page-events",
  "/api/festa60/public-summary",
  "/api/festa60/video-events",
  "/api/stripe/webhook",
];
const expectedProtectedRoutes = [
  "/apply",
  "/apply/*",
  "/admin",
  "/admin/*",
  "/festa60-admin",
  "/festa60-admin/*",
];
const expectedFunctionRoutes = [...expectedProtectedRoutes, ...expectedApiRoutes];

const routes = JSON.parse(await readFile(new URL("../public/_routes.json", import.meta.url), "utf8"));
const worker = await readFile(new URL("../public/_worker.js", import.meta.url), "utf8");
const stagingHeaders = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
const stagingRobots = await readFile(new URL("../public/robots.txt", import.meta.url), "utf8");
const stagingNotFound = await readFile(new URL("../public/404.html", import.meta.url), "utf8");
const productionFestaRobots = await readFile(new URL("../production/robots.txt", import.meta.url), "utf8");
const productionFantasistaRobots = await readFile(new URL("../production/fantasista-robots.txt", import.meta.url), "utf8");
const implementedApiRouteSet = new Set(
  [...worker.matchAll(/routePath:\s*"(\/api\/[^"]+)"/g)]
    .map((match) => match[1].replace(/\/:[^/]+/g, "/*"))
);
if (worker.includes('pathname === "/api/contact"')) implementedApiRouteSet.add("/api/contact");
const implementedApiRoutes = [...implementedApiRouteSet].sort();
const configuredApiRoutes = routes.include.filter((route) => route.startsWith("/api/")).sort();

const checks = [
  ["public pages and assets bypass Pages Functions", !routes.include.includes("/*") && !routes.include.some((route) => route.startsWith("/assets/"))],
  ["Pages Functions routes contain only known APIs and protected pages", JSON.stringify(routes.include) === JSON.stringify(expectedFunctionRoutes)],
  ["every implemented API has a Pages Functions route", JSON.stringify(configuredApiRoutes) === JSON.stringify(implementedApiRoutes)],
  ["staging sends a noindex response header", /X-Robots-Tag:\s*noindex,\s*nofollow,\s*noarchive/i.test(stagingHeaders)],
  ["staging robots disallows crawling", /User-agent:\s*\*/i.test(stagingRobots) && /Disallow:\s*\//i.test(stagingRobots)],
  ["staging has a real noindex 404 page", /<meta name="robots" content="noindex"/i.test(stagingNotFound)],
  ["FESTA production robots remains crawlable", /Allow:\s*\//i.test(productionFestaRobots) && !/Disallow:\s*\/$/im.test(productionFestaRobots)],
  ["FANTASISTA production robots remains crawlable", /Allow:\s*\//i.test(productionFantasistaRobots) && !/Disallow:\s*\/$/im.test(productionFantasistaRobots)],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failed.length) process.exitCode = 1;
