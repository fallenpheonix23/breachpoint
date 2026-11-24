#!/bin/sh
# Start BREACHPOINT on http://localhost:8080
cd "$(dirname "$0")" && echo "Open http://localhost:8080" && python3 -m http.server 8080
