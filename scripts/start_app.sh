#!/usr/bin/env bash
# ==============================================================================
# scripts/start_app.sh
# ------------------------------------------------------------------------------
# One-Click Startup Script for UTH Real-Time Scientific Data Mining & RAG System
# Orchestrates:
#   1. RabbitMQ Ingestion Worker (Background Consumer)
#   2. FastAPI Backend (:8000)
#   3. React + Vite Frontend (:5173)
# Cleanly traps SIGINT/SIGTERM to prevent orphaned processes.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# ANSI Colors
GREEN="\033[1;32m"
BLUE="\033[1;34m"
CYAN="\033[1;36m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
RESET="\033[0m"

echo -e "${BLUE}====================================================================${RESET}"
echo -e "${CYAN}🚀 UTH Real-Time Scientific Data Mining & RAG System${RESET}"
echo -e "${BLUE}====================================================================${RESET}"

# Verify Python Virtual Environment
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
if [ ! -f "${PYTHON_BIN}" ]; then
    echo -e "${YELLOW}[!] Local virtual environment not found at .venv/bin/python.${RESET}"
    if command -v python3 &>/dev/null; then
        PYTHON_BIN="$(command -v python3)"
        echo -e "${GREEN}[+] Falling back to system python: ${PYTHON_BIN}${RESET}"
    else
        echo -e "${RED}[✗] Python 3 not found. Please setup .venv first.${RESET}"
        exit 1
    fi
fi

# Track child PIDs for graceful shutdown
PIDS=()

cleanup() {
    echo -e "\n${YELLOW}[!] Shutdown signal received. Stopping all services...${RESET}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "${pid}" 2>/dev/null; then
            echo -e "${CYAN}[*] Stopping PID ${pid}...${RESET}"
            kill -TERM "${pid}" 2>/dev/null || kill -KILL "${pid}" 2>/dev/null
        fi
    done
    wait 2>/dev/null || true
    echo -e "${GREEN}[✓] All services gracefully terminated. Goodbye!${RESET}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Start RabbitMQ Queue Consumer in Background
echo -e "\n${CYAN}[1/3] Starting RabbitMQ Ingestion Worker...${RESET}"
"${PYTHON_BIN}" -m src.ingestion.queue_consumer &
PIDS+=($!)
CONSUMER_PID=$!
echo -e "${GREEN}[✓] Queue Consumer active (PID: ${CONSUMER_PID})${RESET}"

# 2. Start FastAPI Backend Server
echo -e "\n${CYAN}[2/3] Starting FastAPI Backend on http://0.0.0.0:8000...${RESET}"
"${PYTHON_BIN}" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &
PIDS+=($!)
BACKEND_PID=$!
echo -e "${GREEN}[✓] FastAPI Server active (PID: ${BACKEND_PID})${RESET}"

# 3. Start Frontend Dev Server
echo -e "\n${CYAN}[3/3] Starting React + Vite Frontend on http://localhost:5173...${RESET}"
if [ -d "frontend" ]; then
    npm run dev --prefix frontend &
    PIDS+=($!)
    FRONTEND_PID=$!
    echo -e "${GREEN}[✓] Frontend Server active (PID: ${FRONTEND_PID})${RESET}"
fi

echo -e "\n${BLUE}====================================================================${RESET}"
echo -e "${GREEN}✨ ALL SERVICES RUNNING SUCCESSFULLY! ✨${RESET}"
echo -e "${BLUE}====================================================================${RESET}"
echo -e "  🌐 Frontend Dashboard:      ${CYAN}http://localhost:5173${RESET}"
echo -e "  ⚙️  FastAPI Backend API:     ${CYAN}http://localhost:8000${RESET}"
echo -e "  📚 OpenAPI / Swagger Docs:   ${CYAN}http://localhost:8000/docs${RESET}"
echo -e "  🦅 Apache Airflow UI:       ${CYAN}http://localhost:8080${RESET}"
echo -e "  🪣 MinIO Object Storage:    ${CYAN}http://localhost:9001${RESET} (Console)"
echo -e "  🎯 Qdrant Vector Engine:     ${CYAN}http://localhost:6333/dashboard${RESET}"
echo -e "  🐇 RabbitMQ Management:      ${CYAN}http://localhost:15672${RESET}"
echo -e "${BLUE}====================================================================${RESET}"
echo -e "${YELLOW}Press [Ctrl + C] at any time to gracefully terminate all servers.${RESET}\n"

# Wait for all processes
wait
