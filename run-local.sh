#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "=== Sieglings TCG - local server ==="
echo

if ! command -v java >/dev/null 2>&1; then
  echo "[ERROR] Java is not installed or not on PATH."
  echo "        Install JDK 21+ from https://adoptium.net/"
  exit 1
fi

echo "Java version:"
java -version
echo

export PORT="${PORT:-8080}"
echo "Using port ${PORT}"
echo "Open in browser: http://127.0.0.1:${PORT}/"
echo "  Play:  http://127.0.0.1:${PORT}/play"
echo "  Shop:  http://127.0.0.1:${PORT}/shop"
echo
echo "Accounts, saved decks, and online lobbies need Google Application Default Credentials."
echo "After a fresh OS install, run once: ./scripts/firestore-adc-login.sh"
echo

if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ":${PORT} "; then
  echo "[WARN] Something may already be listening on port ${PORT}."
  echo "       Stop it or run: PORT=8082 ./run-local.sh"
  echo
fi

echo "Starting server... Leave this terminal open while you play."
echo "First run may download Maven dependencies (several minutes)."
echo

chmod +x ./mvnw
exec ./mvnw spring-boot:run
