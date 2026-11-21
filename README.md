# ⚡ Hackathon — Last Server Standing (EC2) — High-Performance Flash Sale API

> Production-grade, concurrency-safe, high-throughput Flash Sale Shop API engineered for the **Last Server Standing** competition (KODR / Spec v1.1).

---

## 📌 1. Project Overview & Architecture Baseline

- **Hardware Target:** AWS EC2 `m7i.large` (2 vCPU, 8 GiB RAM, 30 GiB gp3 SSD, Ubuntu 24.04 LTS).
- **Listening Address:** `0.0.0.0:8080` (HTTP/1.1 with keep-alive).
- **Runtime & Framework:** Node.js (ES Modules), native `cluster` (2 worker processes matching 2 vCPUs), Fastify v5.
- **Database Engine:** Embedded SQLite 3 in WAL mode (`better-sqlite3`, synchronous NORMAL, 64MB cache, 256MB mmap).
- **Process Manager:** Linux `systemd` with automatic sub-second recovery on unexpected crash.

### 🏆 Verified Benchmark Capacity (On EC2 Localhost)
- **READ (`GET /products/:id`):** **61,010 RPS** | p50: 1.90 ms | p99: 3.91 ms | 0% errors (916K reqs in 15s)
- **WRITE (`POST /orders`):** **8,080 RPS** | p50: 2.39 ms | p90: 9.99 ms | 0% errors (80K durable orders in 10s)
- **MIXED (60/15/20/5 Workload):** **19,524 RPS** | p50: 1.50 ms | p99: 16.16 ms | 0% errors
- **Accounting Reconciliation:** 100,000+ persistent orders audited $\to$ **0 overselling**, **0 negative stock**, **0 ghost orders**.

---

## 🚀 2. Quick Start & Execution Steps

### Step 1: Install Dependencies
```bash
# Install production dependencies (before code freeze / network cutoff)
npm install --omit=dev
```

### Step 2: Apply OS Kernel Tuning (Required on EC2)
Tune socket connection backlog and file descriptors to handle 10,000+ open sockets:
```bash
sudo cp deploy/sysctl.conf /etc/sysctl.d/99-last-server.conf
sudo sysctl --system

sudo cp deploy/limits.conf /etc/security/limits.d/99-last-server.conf
```

### Step 3: Run the Server

#### Option A: Production Daemon via systemd (Recommended)
```bash
# Install and start the service
sudo cp deploy/last-server-standing.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now last-server-standing

# Check service status & listening port
sudo systemctl status last-server-standing
sudo ss -tlnp | grep 8080
```

#### Option B: Direct CLI Execution (Development / Testing)
```bash
npm start
```

### Step 4: Health Verification
```bash
curl -i http://localhost:8080/health
# Returns: HTTP/1.1 200 OK {"status":"ok"}
```

---

## 📡 3. Official API Specification & Endpoints

All endpoints run on port `8080` and use `Content-Type: application/json`.

| Method | Endpoint | Description | Success Status | Error Codes |
|---|---|---|---|---|
| `GET` | `/health` | Server readiness check | `200 OK` | — |
| `POST` | `/products` | Create product with initial stock | `201 Created` | `400 VALIDATION_ERROR`, `409 PRODUCT_EXISTS` |
| `GET` | `/products/:id` | Read single product details | `200 OK` | `400 VALIDATION_ERROR`, `404 PRODUCT_NOT_FOUND` |
| `GET` | `/products?category=X&page=1&limit=20` | Paginated products sorted by `price ASC, id ASC` | `200 OK` | `400 VALIDATION_ERROR` |
| `POST` | `/orders` | Atomic purchase of 1 unit | `201 Created` | `400 VALIDATION_ERROR`, `404 PRODUCT_NOT_FOUND`, `409 ALREADY_PURCHASED`, `409 SOLD_OUT` |
| `GET` | `/users/:userId/orders` | Read user purchase history | `200 OK` | `400 VALIDATION_ERROR` |

### Sample Commands

```bash
# 1. Create a product
curl -X POST http://localhost:8080/products \
  -H "Content-Type: application/json" \
  -d '{"id":"p_phone1","name":"Pixel 10 Pro","category":"electronics","price":79999,"stock":100}'

# 2. Get product by ID
curl http://localhost:8080/products/p_phone1

# 3. List products by category
curl "http://localhost:8080/products?category=electronics&page=1&limit=20"

# 4. Purchase 1 unit
curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{"userId":"u_user101","productId":"p_phone1"}'

# 5. Get user orders
curl http://localhost:8080/users/u_user101/orders
```

---

## 🧪 4. Testing & Verification Suite

Run these tests directly on the machine to guarantee 100% compliance with competition rules:

```bash
# 1. Run full functional test suite (27 API edge-case checks)
npm test

# 2. Run concurrency tests (Test A: 50 concurrent buyers, 1 unit; Test B: 20 duplicate clicks)
npm run test:concurrency

# 3. Run data reconciliation audit (verifies all 7 sale invariants on SQLite database)
npm run test:reconciliation
```

---

## ⚡ 5. Load Testing & Benchmarking

```bash
# 1. Seed high-volume test products (p_bench_50k, p_load_100, p_load_write_test)
node tests/seed-bench.js

# 2. High-speed raw READ benchmark with wrk (target: 50K+ RPS)
wrk -t2 -c120 -d15s --latency http://localhost:8080/products/p_bench_50k

# 3. High-throughput atomic WRITE benchmark with wrk
wrk -t2 -c50 -d10s -s tests/load/order.lua --latency http://localhost:8080/orders

# 4. Mixed workload benchmark (60% detail, 15% category, 20% orders, 5% user orders)
wrk -t2 -c80 -d10s -s tests/load/mixed.lua --latency http://localhost:8080/
```

---

## 💥 6. Crash Recovery & Resilience Check

Verify that the systemd service auto-restarts within $< 1\text{ s}$ and preserves all committed orders:

```bash
# 1. Kill the primary node process
sudo kill -9 $(pgrep -f "node src/server.js" | head -n 1)

# 2. Immediately verify health
curl -s http://localhost:8080/health
# Response: {"status":"ok"}

# 3. Confirm zero data corruption
npm run test:reconciliation
```

---

## 📁 7. Project Structure

```text
├── README.md                 # Main Operations & Server Run Guide
├── docs/                     # Core Specification & Design Documents
│   ├── PRD.md                # Requirements, Data Model & Error Contracts
│   ├── architecture.md       # Multi-Core Clustered Architecture & Pragmas
│   ├── rules.md              # Official Rulebook Constraints & Invariants
│   ├── phases.md             # Controlled SDLC Execution Plan
│   ├── design.md             # Technical In-Memory Cache & Concurrency Design
│   └── memory.md             # Measured Performance Logs & Server History
├── src/                      # Application Source Code
│   ├── app.js                # Fastify App Instance & Plugins
│   ├── server.js             # Native Clustered Server Entrypoint
│   ├── cache/                # In-memory Pre-encoded Buffer Cache (2s TTL)
│   ├── config/               # Environment & Port Configuration
│   ├── db/                   # SQLite WAL Connection & Schema SQL
│   ├── routes/               # API Route Handlers (/health, /products, /orders, /users)
│   ├── services/             # Atomic Business Logic & DB Prepared Statements
│   └── utils/                # Error Formatting Utilities
├── tests/                    # Verification & Benchmark Scripts
│   ├── functional.test.js    # Functional Validation Suite
│   ├── concurrency.test.js   # Race Condition & Double-Click Tests
│   ├── reconciliation.test.js# Post-Run Stock Audit
│   ├── seed-bench.js         # Benchmark Data Seeder
│   └── load/                 # wrk Lua Scripts & Autocannon Load Runners
├── deploy/                   # Production Deployment Configurations
│   ├── last-server-standing.service # systemd Service Definition
│   ├── limits.conf           # OS ulimit NOFILE Configuration
│   └── sysctl.conf           # Linux Kernel Network Tuning
├── package.json
└── .gitignore
```

---

## 📚 8. Detailed Documentation Links

Detailed engineering specifications are located in the `docs/` folder:
- [docs/PRD.md](docs/PRD.md) — Complete Product Requirements & Data Constraints
- [docs/architecture.md](docs/architecture.md) — Node.js Clustering & SQLite WAL Strategy
- [docs/rules.md](docs/rules.md) — Competition Invariants & Official Rulebook Audit
- [docs/phases.md](docs/phases.md) — Project Implementation Phases & Milestones
- [docs/design.md](docs/design.md) — Transaction Design & Cache Synchronization
- [docs/memory.md](docs/memory.md) — Live Benchmark Results & Deployment Log
