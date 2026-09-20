SHELL := /bin/bash
.ONESHELL:
.DEFAULT_GOAL := help

BACKEND_DIR := backend
FRONTEND_DIR := frontend
RUN_DIR := .make-run

BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
FRONTEND_HOST ?= 127.0.0.1
FRONTEND_PORT ?= 8083

BACKEND_PID := $(RUN_DIR)/backend.pid
FRONTEND_PID := $(RUN_DIR)/frontend.pid
BACKEND_LOG := $(RUN_DIR)/backend.log
FRONTEND_LOG := $(RUN_DIR)/frontend.log
PYTEST_VERBOSE_FLAGS := -vv -rA -s --tb=short --durations=0
HTTP_CHECK = uv run --project "$(CURDIR)/$(BACKEND_DIR)" python -c 'import sys; from urllib.request import urlopen; urlopen(sys.argv[1], timeout=2).close()'

.PHONY: help up down restart status logs build test test-automation test-accuracy test-scalability test-live-accuracy check-tools check-ports

help: ## Show the available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check-tools:
	@set -e
	@command -v uv >/dev/null || { echo "Error: uv is required but was not found."; exit 1; }
	@command -v yarn >/dev/null || { echo "Error: yarn is required but was not found."; exit 1; }
	@command -v setsid >/dev/null || { echo "Error: setsid is required but was not found."; exit 1; }
	@command -v ss >/dev/null || { echo "Error: ss (iproute2) is required but was not found."; exit 1; }

check-ports:
	@set -e
	@for port in $(BACKEND_PORT) $(FRONTEND_PORT); do
		listeners="$$(ss -H -ltnp "sport = :$$port")"
		if [ -n "$$listeners" ]; then
			echo "Port $$port is already occupied:"
			echo "$$listeners"
			echo "Stop that server first, or choose BACKEND_PORT / FRONTEND_PORT."
			echo "For servers managed by this Makefile, use 'make restart'."
			exit 1
		fi
	done

build: check-tools ## Build the production frontend
	@echo "Building frontend..."
	@cd $(FRONTEND_DIR) && yarn build

up: check-tools ## Build the frontend and start the backend and frontend
	@set -e
	@mkdir -p $(RUN_DIR)
	@running=0
	@for service in backend frontend; do
		pid_file="$(RUN_DIR)/$$service.pid"
		if [ -f "$$pid_file" ]; then
			pid="$$(cat "$$pid_file")"
			if [[ "$$pid" =~ ^[0-9]+$$ ]] && kill -0 "$$pid" 2>/dev/null; then
				running=$$((running + 1))
			fi
		fi
	done
	@if [ "$$running" -eq 2 ] && $(HTTP_CHECK) "http://$(BACKEND_HOST):$(BACKEND_PORT)/health" >/dev/null 2>&1 && $(HTTP_CHECK) "http://$(FRONTEND_HOST):$(FRONTEND_PORT)/" >/dev/null 2>&1; then
		echo "Both services are already running. Use 'make restart' to rebuild and restart."
		exit 0
	fi
	@if [ "$$running" -gt 0 ]; then
		echo "Existing managed services need a restart. Run 'make restart'."
		exit 1
	fi
	@$(MAKE) --no-print-directory check-ports
	@$(MAKE) --no-print-directory build
	@trap '$(MAKE) --no-print-directory down' ERR INT TERM
	@nohup setsid bash -c 'cd "$(CURDIR)/$(BACKEND_DIR)" && exec uv run uvicorn app.main:app --host "$(BACKEND_HOST)" --port "$(BACKEND_PORT)"' >$(BACKEND_LOG) 2>&1 &
	@echo $$! > $(BACKEND_PID)
	@nohup setsid bash -c 'cd "$(CURDIR)/$(FRONTEND_DIR)" && exec yarn start --hostname "$(FRONTEND_HOST)" --port "$(FRONTEND_PORT)"' >$(FRONTEND_LOG) 2>&1 &
	@echo $$! > $(FRONTEND_PID)
	@for attempt in {1..30}; do
		if ! kill -0 "$$(cat $(BACKEND_PID))" 2>/dev/null || ! kill -0 "$$(cat $(FRONTEND_PID))" 2>/dev/null; then
			break
		fi
		if $(HTTP_CHECK) "http://$(BACKEND_HOST):$(BACKEND_PORT)/health" >/dev/null 2>&1 && $(HTTP_CHECK) "http://$(FRONTEND_HOST):$(FRONTEND_PORT)/" >/dev/null 2>&1; then
			echo "Backend: http://$(BACKEND_HOST):$(BACKEND_PORT)"
			echo "Frontend: http://$(FRONTEND_HOST):$(FRONTEND_PORT)"
			exit 0
		fi
		sleep 1
	done
	@echo "A service failed to become ready. Recent logs:"
	@tail -n 20 $(BACKEND_LOG) $(FRONTEND_LOG)
	@$(MAKE) --no-print-directory down
	@exit 1

down: ## Stop the backend and frontend started by make up
	@set +e
	@for service in frontend backend; do
		pid_file="$(RUN_DIR)/$$service.pid"
		if [ ! -f "$$pid_file" ]; then
			echo "$$service is not running (no PID file)."
			continue
		fi
		pid="$$(cat "$$pid_file")"
		if [[ "$$pid" =~ ^[0-9]+$$ ]] && kill -0 "$$pid" 2>/dev/null; then
			kill -TERM -- "-$$pid" 2>/dev/null
			for _ in {1..20}; do
				kill -0 "$$pid" 2>/dev/null || break
				sleep 0.25
			done
			if kill -0 "$$pid" 2>/dev/null; then
				kill -KILL -- "-$$pid" 2>/dev/null
			fi
			echo "Stopped $$service."
		else
			echo "$$service was not running."
		fi
		rm -f "$$pid_file"
	done

restart: ## Rebuild and restart both services
	@$(MAKE) --no-print-directory down && $(MAKE) --no-print-directory up

status: ## Show whether the backend and frontend are running
	@for service in backend frontend; do
		pid_file="$(RUN_DIR)/$$service.pid"
		if [ -f "$$pid_file" ] && kill -0 "$$(cat "$$pid_file")" 2>/dev/null; then
			echo "$$service: running (PID $$(cat "$$pid_file"))"
		else
			echo "$$service: stopped"
		fi
	done

logs: ## Follow backend and frontend logs (Ctrl-C exits without stopping services)
	@mkdir -p $(RUN_DIR)
	@touch $(BACKEND_LOG) $(FRONTEND_LOG)
	@tail -n 100 -F $(BACKEND_LOG) $(FRONTEND_LOG)

test: test-automation ## Run the automated accuracy, scalability, and speed tests

test-automation: check-tools ## Run the automated accuracy, scalability, and speed tests
	@SECONDS=0
	@echo "============================================================"
	@echo "AUTOMATED BACKEND BENCHMARKS"
	@echo "============================================================"
	@echo "This run reports:"
	@echo "  - parser accuracy across all 1,000 labelled dataset rows"
	@echo "  - full-dataset API processing and the 15-second speed limit"
	@echo "  - acceptance at, and rejection above, the 25 MB CSV limit"
	@echo "  - every test result, skip reason, and individual duration"
	@echo
	@cd $(BACKEND_DIR)
	@uv run pytest $(PYTEST_VERBOSE_FLAGS) tests/test_accuracy.py tests/test_scalability.py
	@status=$$?
	@echo
	@if [ $$status -eq 0 ]; then
		echo "RESULT: PASSED - all required accuracy and scalability checks succeeded."
	else
		echo "RESULT: FAILED - review the failing test and traceback above."
	fi
	@echo "Total benchmark time: $${SECONDS}s"
	@exit $$status

test-accuracy: check-tools ## Calculate deterministic parser accuracy over the full dataset
	@SECONDS=0
	@echo "============================================================"
	@echo "DETERMINISTIC ACCURACY BENCHMARK"
	@echo "============================================================"
	@echo "Scoring case type, case kind, lifecycle, damage zones, and severity"
	@echo "against all 1,000 labelled rows. The detailed score report follows."
	@echo
	@cd $(BACKEND_DIR)
	@uv run pytest $(PYTEST_VERBOSE_FLAGS) tests/test_accuracy.py -m "not live_llm"
	@status=$$?
	@echo
	@if [ $$status -eq 0 ]; then echo "RESULT: PASSED"; else echo "RESULT: FAILED"; fi
	@echo "Total accuracy-test time: $${SECONDS}s"
	@exit $$status

test-scalability: check-tools ## Test full-dataset throughput, speed, and upload-size limits
	@SECONDS=0
	@echo "============================================================"
	@echo "SCALABILITY AND SPEED BENCHMARK"
	@echo "============================================================"
	@echo "Success criteria:"
	@echo "  - process all 1,000 CSV rows with no errors in under 15 seconds"
	@echo "  - accept a CSV at the exact 25 MB limit"
	@echo "  - reject a CSV larger than 25 MB with HTTP 413"
	@echo
	@cd $(BACKEND_DIR)
	@uv run pytest $(PYTEST_VERBOSE_FLAGS) tests/test_scalability.py
	@status=$$?
	@echo
	@if [ $$status -eq 0 ]; then echo "RESULT: PASSED"; else echo "RESULT: FAILED"; fi
	@echo "Total scalability-test time: $${SECONDS}s"
	@exit $$status

test-live-accuracy: check-tools ## Run the optional live LLM accuracy benchmark (requires API configuration)
	@SECONDS=0
	@echo "============================================================"
	@echo "LIVE LLM ACCURACY BENCHMARK"
	@echo "============================================================"
	@echo "This calls the configured LLM for all 1,000 dataset rows."
	@echo "Required environment: LLM_ENABLED and DEEPSEEK_API_KEY."
	@echo
	@cd $(BACKEND_DIR)
	@RUN_LIVE_LLM_TESTS=1 uv run pytest $(PYTEST_VERBOSE_FLAGS) tests/test_accuracy.py -m live_llm
	@status=$$?
	@echo
	@if [ $$status -eq 0 ]; then echo "RESULT: PASSED"; else echo "RESULT: FAILED"; fi
	@echo "Total live-accuracy time: $${SECONDS}s"
	@exit $$status
