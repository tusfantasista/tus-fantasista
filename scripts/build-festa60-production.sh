#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$root_dir/public"
output_dir="$root_dir/festa60-public"

if [[ "$output_dir" != "$root_dir/festa60-public" ]]; then
  echo "Unexpected output directory: $output_dir" >&2
  exit 1
fi

rm -rf "$output_dir"
mkdir -p "$output_dir"

cp -R "$source_dir/assets" "$output_dir/assets"
cp -R "$source_dir/festa-60th" "$output_dir/festa-60th"
cp -R "$source_dir/festa60-register" "$output_dir/festa60-register"
cp -R "$source_dir/festa60-admin" "$output_dir/festa60-admin"
cp "$source_dir/_worker.js" "$output_dir/_worker.js"
cp "$source_dir/contact-api.js" "$output_dir/contact-api.js"
cp "$source_dir/cloudflare-protection.js" "$output_dir/cloudflare-protection.js"
cp "$source_dir/_routes.json" "$output_dir/_routes.json"
cp "$root_dir/production/festa60-root.html" "$output_dir/index.html"
cp "$root_dir/production/404.html" "$output_dir/404.html"
cp "$root_dir/production/robots.txt" "$output_dir/robots.txt"
cp "$root_dir/production/sitemap.xml" "$output_dir/sitemap.xml"
cp "$root_dir/production/google710a6c95640111d9.html" "$output_dir/google710a6c95640111d9.html"

# Include current prices in the raw HTML as well as the browser-rendered Event.
node "$root_dir/scripts/build-festa60-event-schema.mjs" "$output_dir/festa-60th/index.html"

# Remove internal review-phase markers from the standalone production artifact.
find "$output_dir" -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" \) \
  -exec perl -0pi -e 's~/\*\s*REVIEW_[^*]*\*/~~g; s~<!--\s*REVIEW_[^-]*-->~~g' {} +

echo "Built $output_dir"
