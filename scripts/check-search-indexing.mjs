import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const verificationFile = 'google710a6c95640111d9.html';
const verification = await fs.readFile(`production/${verificationFile}`, 'utf8');
assert.equal(verification, `google-site-verification: ${verificationFile}`);

const sites = [
  { directory: 'fantasista-site/public', origin: 'https://tus-fantasista.pages.dev', home: '/', required: ['/news/festa60-registration-open/'] },
  { directory: 'festa60-public', origin: 'https://tus-fantasista-festa60.pages.dev', home: '/festa-60th/', required: ['/festa-60th/support/'] },
];

for (const site of sites) {
  const robots = await fs.readFile(`${site.directory}/robots.txt`, 'utf8');
  assert(robots.includes(`Sitemap: ${site.origin}/sitemap.xml`), `${site.origin}: sitemap discovery`);
  assert(!/^Disallow:\s*\/\s*$/m.test(robots), `${site.origin}: no site-wide crawl block`);
  const sitemap = await fs.readFile(`${site.directory}/sitemap.xml`, 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]));
  assert(urls.length > 0, `${site.origin}: nonempty sitemap`);
  assert.equal(new Set(urls.map(String)).size, urls.length, `${site.origin}: unique URLs`);
  for (const expected of [site.home, ...site.required]) {
    assert(urls.some((url) => url.pathname === expected), `${site.origin}: required URL ${expected}`);
  }
  for (const url of urls) {
    assert.equal(url.origin, site.origin, 'Sitemap must use its production origin');
    assert(!/\/(?:api|festa60-admin|festa60-register)(?:\/|$)/.test(url.pathname), 'Operational pages stay out of the sitemap');
    const file = path.join(site.directory, url.pathname, 'index.html');
    const html = await fs.readFile(file, 'utf8');
    const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
    assert.equal(canonical, url.href, `Canonical agrees with sitemap: ${url.href}`);
    const directives = [...html.matchAll(/<meta\b[^>]*name=["'](?:robots|googlebot)["'][^>]*>/gi)].map((match) => match[0]);
    assert(directives.every((directive) => !/\b(?:noindex|none)\b/i.test(directive)), `Indexable HTML: ${url.href}`);
    for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      JSON.parse(match[1]);
    }
  }
  assert.equal(await fs.readFile(`${site.directory}/${verificationFile}`, 'utf8'), verification, 'Ownership proof survives the build unchanged');
  console.log(`PASS ${site.origin}: ${urls.length} indexable canonical sitemap pages; ownership proof preserved`);
}
