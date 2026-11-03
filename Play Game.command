#!/bin/bash
# Serves the game on http://localhost:8787 and opens it in the default browser.
cd "$(dirname "$0")"
PORT=8787
( sleep 1; open "http://localhost:$PORT/" ) &
echo "Bridge Builder is running at http://localhost:$PORT/  (press Ctrl+C to stop)"
python3 -m http.server "$PORT"
