# Implementation Roadmap (Phases 1 — 12)
# Last Server Standing — High-Performance Flash Sale API

---

## Roadmap Overview

Development follows a strict, verification-driven software development lifecycle. **Correctness and data integrity take absolute priority over premature optimization.**

| Phase | Title | Focus Area | Deliverable |
|---|---|---|---|
| **Phase 1** | Documentation & Approval Gate | Specification & Architecture | Approved 6 Documentation Files |
| **Phase 2** | Project Initialization & Baseline | Environment & Packaging | Initialized ES Module Repo, Fastify Setup |
| **Phase 3** | Database Engine & Schema Migrations | Local Persistence & Indexes | Database DDL, Constraints, WAL Engine |
| **Phase 4** | Core Read & Management APIs | CRUD, Category Listing, Sorting | Endpoints 1, 2, 3, 4 Implementation |
| **Phase 5** | Atomic Order Engine & Invariants | Concurrency, Invariants 1–7 | Endpoint 5 (`POST /orders`) & Endpoint 6 |
| **Phase 6** | Comprehensive Functional Verification | Official Contract Testing | 100% Pass on Functional Suite (40 Cases) |
| **Phase 7** | Concurrency & Race Condition Testing | Parallelism, Test A & Test B | Zero Overselling, Zero Duplicate Purchases |
| **Phase 8** | High-Throughput Read Caching | L1 In-Memory Cache (2s TTL) | Low-Latency Reads for 75% of Traffic |
| **Phase 9** | Crash Recovery & Local Durability | Unattended Self-Healing | Systemd Supervisor, SIGKILL Test C |
| **Phase 10** | Load Testing & Benchmark Simulation | Ramp Profiling (L1 — L17) | Automated Autocannon Benchmark Reports |
| **Phase 11** | Linux OS & Production Hardening | Kernel Tuning & Sockets | `sysctl`, `LimitNOFILE`, Keep-Alive Tuning |
| **Phase 12** | Final Compliance Audit & Code Freeze | Pre-Flight Verification | Pre-Flight Report & Freeze Handover |

---

## Detailed Phase Breakdown

### Phase 1: Documentation & Architecture Approval Gate
- **Objective:** Establish unambiguous specifications, technical design, and official rule constraints before writing source code.
- **Tasks:**
  1. Parse authoritative rulebook `last-server-standing-rules.html`.
  2. Author `PRD.md`, `architecture.md`, `rules.md`, `phases.md`, `design.md`, `memory.md`.
  3. Conduct consistency audit across all documents.
  4. Present summary to the user for formal approval.
- **Deliverables:** Six Markdown documentation files in project root.
- **Acceptance Criteria:** User provides explicit approval to begin implementation.
- **Rollback Procedure:** Revise documentation based on feedback.

---

### Phase 2: Project Initialization & Runtime Setup
- **Objective:** Configure the Node.js ES Modules environment with high-performance production dependencies and zero runtime bloat.
- **Tasks:**
  1. Initialize `package.json` with `"type": "module"`.
  2. Install core production dependencies: `fastify`, database driver (`better-sqlite3` or `pg`).
  3. Install dev test tools: `autocannon`, test harness utilities.
  4. Configure npm scripts: `start`, `dev`, `test`, `test:concurrency`.
  5. Establish clean directory layout (`src/`, `tests/`, `config/`).
- **Files Created:** `package.json`, `src/app.js`, `src/config/env.js`.
- **Acceptance Criteria:** Minimal dependencies, no development watchers in production scripts, starts cleanly on port 8080.

---

### Phase 3: Database Engine, Schema & Constraints
- **Objective:** Establish the local persistent database with hard constraints preventing data corruption.
- **Tasks:**
  1. Configure local database in WAL mode with tuned sync and cache pragmas.
  2. Implement tables: `products` and `orders`.
  3. Define constraints:
     - `CHECK (price >= 0)`
     - `CHECK (stock >= 0)`
     - `UNIQUE (user_id, product_id)` on `orders`.
  4. Create optimal indexes for category queries (`category, price, id`) and user orders (`user_id`).
- **Files Created:** `src/db/connection.js`, `src/db/schema.sql`, `src/db/migrations.js`.
- **Acceptance Criteria:** Schema creates cleanly, tables survive process restarts, constraints reject invalid data at DB level.

---

### Phase 4: Core Read & Management APIs
- **Objective:** Implement Endpoints 1, 2, 3, and 4 matching official contract schemas.
- **Tasks:**
  1. `GET /health`: Readiness check returning 200 `{ "status": "ok" }`.
  2. `POST /products`: Product creation with exact field validation, 400 for errors, 409 for duplicate ID.
  3. `GET /products/:id`: Exact product lookup, 404 for missing.
  4. `GET /products?category=...&page=...&limit=...`: Sorting by `price ASC, id ASC`, accurate `total`, pagination defaults.
- **Files Created:** `src/routes/health.js`, `src/routes/products.js`, `src/services/productService.js`.
- **Acceptance Criteria:** All input validation matches v1.1 spec, pagination math is exact.

---

### Phase 5: Atomic Order Engine & Invariants
- **Objective:** Implement `POST /orders` and `GET /users/:userId/orders` with atomic decrement and zero race conditions.
- **Tasks:**
  1. Construct atomic purchase transaction:
     - Verify product existence $\to$ 404 if missing.
     - Atomic decrement `UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0`.
     - Insert order into `orders` table.
     - On unique violation $\to$ rollback stock decrement, return `409 ALREADY_PURCHASED`.
     - On stock exhausted $\to$ return `409 SOLD_OUT`.
  2. Implement `GET /users/:userId/orders`: Returns `{ "userId": "...", "orders": [...] }`.
- **Files Created:** `src/routes/orders.js`, `src/services/orderService.js`.
- **Acceptance Criteria:** Enforces all 7 sale invariants, handles double-clicks safely, never oversells.

---

### Phase 6: Automated Functional Test Suite
- **Objective:** Build an automated test suite verifying all 40 functional edge cases.
- **Tasks:**
  1. Test all 6 endpoints with valid and invalid payloads.
  2. Test all 5 official error codes.
  3. Test category sorting (price tie-break by ID).
  4. Test pagination edge cases (page past total, empty categories).
- **Files Created:** `tests/functional.test.js`.
- **Acceptance Criteria:** 100% pass rate on all functional tests.

---

### Phase 7: Concurrency & Stress Verification
- **Objective:** Prove concurrency safety under extreme race conditions.
- **Tasks:**
  1. **Test A (Last Unit):** 1 unit in stock, 50 parallel requests $\to$ exactly one 201, 49 409s, stock = 0.
  2. **Test B (Double-Click):** 1000 units, 20 parallel requests for same user $\to$ exactly one 201, 19 409s, stock = 999.
  3. **Reconciliation Audit:** Verify $\text{Final Stock} = \text{Initial Stock} - \text{Orders}$.
- **Files Created:** `tests/concurrency.js`.
- **Acceptance Criteria:** Zero oversells, zero duplicate purchases, zero negative stock.

---

### Phase 8: High-Throughput Read Caching (2-Second Rule)
- **Objective:** Offload 75% read traffic (`GET /products/:id` and category lists) to in-memory cache while respecting freshness rules.
- **Tasks:**
  1. In-memory product cache for static attributes (`name`, `category`, `price`).
  2. Dual-clock stock cache with 2-second TTL.
  3. Immediate cache population on `POST /products`.
  4. Cache-bypass guarantee for `POST /orders`.
- **Files Created:** `src/cache/lruCache.js`.
- **Acceptance Criteria:** Reads served in $< 1\text{ ms}$, stock staleness strictly $< 2\text{s}$, order checks remain authoritative.

---

### Phase 9: Crash Recovery & Persistence Audit
- **Objective:** Verify unattended recovery and persistence after an abrupt SIGKILL.
- **Tasks:**
  1. Write systemd unit file (`last-server-standing.service`).
  2. Test 3: Insert product, purchase, kill process (`kill -9`), verify auto-restart within 2s, verify data intact.
  3. Verify offline boot (no internet access).
- **Files Created:** `deploy/last-server-standing.service`, `tests/recovery.sh`.
- **Acceptance Criteria:** Process auto-restarts, zero data loss, health endpoint returns 200 OK.

---

### Phase 10: Load Testing & Benchmark Emulation
- **Objective:** Simulate official stepped benchmark ramp (Levels 1 — 17) using autocannon.
- **Tasks:**
  1. Create benchmark harness replicating official traffic distribution (60% detail, 15% category, 20% order, 5% user orders).
  2. Run stepped load test (500 RPS $\to$ 10,000+ RPS).
  3. Measure p50, p95, p99 latency, error rates, and CPU/memory utilization.
- **Files Created:** `tests/load/benchmark.js`, `tests/load/scenarios.js`.
- **Acceptance Criteria:** p99 latency $\le 100\text{ ms}$, error rate $\le 1.0\%$, zero wrong answers.

---

### Phase 11: Production Hardening & OS Tuning
- **Objective:** Optimize Linux kernel network stack and file descriptor limits on the EC2 host.
- **Tasks:**
  1. Set `sysctl` parameters: `net.core.somaxconn = 65535`, `net.ipv4.tcp_max_syn_backlog = 65535`, `net.ipv4.ip_local_port_range = 1024 65535`.
  2. Raise file limits: `fs.file-max = 2097152`, `nofile = 65535`.
  3. Configure Fastify keep-alive and zero-log production mode.
- **Files Created:** `deploy/sysctl.conf`, `deploy/limits.conf`.
- **Acceptance Criteria:** Handles 5,000 concurrent sockets without connection drops.

---

### Phase 12: Pre-Flight Checklist & Final Code Freeze
- **Objective:** Conduct the complete official pre-flight inspection before final freeze.
- **Tasks:**
  1. Verify `ss -tlnp | grep 8080` binds to `0.0.0.0:8080`.
  2. Confirm offline restart capability.
  3. Execute final end-to-end audit report.
  4. Deliver `README.md` with complete operational commands.
- **Files Created:** `README.md`, `memory.md` (updated).
- **Acceptance Criteria:** Every item in section 11 of the rulebook passes.
