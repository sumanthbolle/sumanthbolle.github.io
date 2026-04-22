#!/usr/bin/env bash
# Ping the IndexNow API (Bing, Yandex, Seznam, Naver) to tell them your
# URLs changed. Bing powers Edge search, Copilot, and ChatGPT web search,
# so this is the fastest way to get Edge search to pick up new pages.
#
# Prereq: the key file /f039f5e45ebd1c5405eb99fefc633d01.txt must be
# reachable on your live site. It already is (committed at repo root).
#
# Usage:
#   scripts/indexnow-ping.sh                      # ping the top static pages
#   scripts/indexnow-ping.sh /summaverick         # ping a single URL
#   scripts/indexnow-ping.sh /blog /interviews    # ping several URLs

set -euo pipefail

HOST="sumanthbolle.com"
KEY="f039f5e45ebd1c5405eb99fefc633d01"
KEY_LOCATION="https://${HOST}/${KEY}.txt"

if [[ $# -gt 0 ]]; then
  paths=("$@")
else
  paths=(
    "/"
    "/summaverick"
    "/blog"
    "/interviews"
    "/tutorials.html"
    "/quiz.html"
    "/technical-terms-quiz.html"
  )
fi

url_list=""
for p in "${paths[@]}"; do
  # Accept either /path or full URL
  if [[ "$p" == http* ]]; then
    full="$p"
  else
    full="https://${HOST}${p}"
  fi
  url_list+="\"${full}\","
done
url_list="${url_list%,}"

payload=$(cat <<JSON
{
  "host": "${HOST}",
  "key": "${KEY}",
  "keyLocation": "${KEY_LOCATION}",
  "urlList": [${url_list}]
}
JSON
)

echo "Pinging IndexNow for ${#paths[@]} URL(s)..."
curl -sS -X POST "https://api.indexnow.org/IndexNow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "${payload}" \
  -w "\nHTTP %{http_code}\n"
