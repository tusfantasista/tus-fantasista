#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$root_dir/public"
output_dir="$root_dir/fantasista-site/public"

if [[ "$output_dir" != "$root_dir/fantasista-site/public" ]]; then
  echo "Unexpected output directory: $output_dir" >&2
  exit 1
fi

rm -rf "$output_dir"
mkdir -p "$output_dir"

for directory in about archive assets contact css data documents festa gallery history js news privacy terms; do
  cp -R "$source_dir/$directory" "$output_dir/$directory"
done

cp "$source_dir/index.html" "$output_dir/index.html"
cp "$source_dir/thanks.html" "$output_dir/thanks.html"
cp "$root_dir/production/fantasista-404.html" "$output_dir/404.html"
cp "$root_dir/production/fantasista-robots.txt" "$output_dir/robots.txt"
cp "$root_dir/production/fantasista-sitemap.xml" "$output_dir/sitemap.xml"
cp "$root_dir/production/google710a6c95640111d9.html" "$output_dir/google710a6c95640111d9.html"
cp "$root_dir/production/fantasista-headers.txt" "$output_dir/_headers"
cp "$root_dir/production/fantasista-worker.js" "$output_dir/_worker.js"
cp "$root_dir/production/fantasista-routes.json" "$output_dir/_routes.json"
cp "$source_dir/contact-api.js" "$output_dir/contact-api.js"
cp "$source_dir/cloudflare-protection.js" "$output_dir/cloudflare-protection.js"

# Internal review-phase labels are not part of the public production artifact.
find "$output_dir" -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" \) \
  -exec perl -0pi -e 's~/\*\s*REVIEW_[^*]*\*/~~g; s~<!--\s*REVIEW_[^-]*-->~~g' {} +

echo "Built $output_dir"
