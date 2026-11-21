# Persistent Project Memory & State Log
# Last Server Standing — High-Performance Flash Sale API

---

## 1. Project Identity & Context
- **Project:** Last Server Standing
- **Organization:** Sheryians Coding School — KODR
- **Specification:** Rules & API Spec v1.1 (18 November 2026)
- **Primary Goal:** Build an extremely reliable, low-latency, concurrency-safe Flash Sale Shop API on an AWS EC2 instance capable of passing all functional checks, sale audits, and competing up to Level 17 (50,000 RPS).
- **Core Principle:** Correctness First. Data Integrity Always. Performance Through Measurement. No Rule Violations. No Fake Test Results.

---

## 2. Machine & Infrastructure Baseline
- **Cloud Provider:** AWS EC2
- **Instance IP:** `54.245.145.148` (Host: `ip-172-31-25-244`)
- **Instance Type:** `m7i.large`
- **CPU:** 2 vCPU (Intel Xeon Platinum 8488C, 1 physical core, 2 threads)
- **RAM:** 8 GiB
- **Disk:** 30 GiB gp3 SSD (3,000 IOPS, 125 MB/s)
- **OS:** Ubuntu Server 24.04 LTS (x86_64)
- **Runtime:** Node.js v24.22.3 (ES Modules)
- **Port & Address:** `0.0.0.0:8080` (Plain HTTP/1.1 with keep-alive)
- **Process Supervisor:** Linux `systemd` (`last-server-standing.service`) running Node.js Native Cluster with 2 workers.

---

## 3. Strict Prohibitions & Official Constraints
- **NO External Services:** Strictly no MongoDB Atlas, AWS RDS, Managed Redis, Supabase, Firebase, or external servers. All permanent data lives on local disk in SQLite WAL (`data/shop.db`).
- **NO Goldfish Databases:** In-memory storage is not the only source of truth. Data is durably persisted across process restarts.
- **NO Rate Limiting:** No global rate limiter (avoids blocking 100% of benchmark traffic from 1 IP).
- **NO Dev Watchers:** Production uses direct `node src/server.js` under systemd without `nodemon`.
- **NO Per-Request Logging:** Zero console access logging in production to prevent I/O saturation at high RPS.
- **NO Unattended Downtime:** Server recovers unattended via `systemd` within $< 1\text{ s}$ after SIGKILL without internet access.

---

## 4. Completed Implementation Phases

- [x] **Phase 1: Documentation & Architecture Approval Gate** — COMPLETE (Approved all 6 docs).
- [x] **Phase 2: Project Initialization & Runtime Setup** — COMPLETE (`package.json`, Fastify, ES Modules).
- [x] **Phase 3: Database Engine & Schema Migrations** — COMPLETE (SQLite WAL mode, composite indexes, CHECK constraints).
- [x] **Phase 4: Core Read & Management APIs** — COMPLETE (Endpoints 1, 2, 3, 4 with exact schema validation and tie-breaker sorting).
- [x] **Phase 5: Atomic Order Engine & Invariants** — COMPLETE (Atomic decrement transaction, duplicate rejection, order history).
- [x] **Phase 6: Automated Functional Test Suite** — COMPLETE (27/27 edge cases verified, 100% pass rate).
- [x] **Phase 7: Concurrency & Stress Verification** — COMPLETE (Test A 50 buyers 1 unit $\to$ 1 winner; Test B 20 duplicate clicks $\to$ 1 order).
- [x] **Phase 8: High-Throughput Read Caching** — COMPLETE (L1 Cache with 1.9s TTL buffer under 2-second rule + pre-encoded buffers).
- [x] **Phase 9: Crash Recovery & Local Durability** — COMPLETE (Systemd unit, atomic WAL recovery).
- [x] **Phase 10: Load Testing & Benchmark Emulation** — COMPLETE (Directly on EC2: 30,861 RPS passed with p99 = 91ms, 41,053 RPS peak achieved with 0% errors).
- [x] **Phase 11: Production Hardening & OS Tuning** — COMPLETE (`deploy/sysctl.conf`, `deploy/limits.conf` applied on EC2).
- [x] **Phase 12: Final Deployment on Live EC2 Instance** — COMPLETE (Clustered systemd service active on `54.245.145.148:8080`).

---

## 5. Live EC2 Measured Benchmark Results

### 1. READ Mode Benchmark (Local on EC2 host `54.245.145.148`):
| Target RPS | Achieved RPS | Connections | p50 Latency | p97.5 Latency | p99 Latency | Error Rate | 2xx Responses | Status |
|---|---|---|---|---|---|---|---|---|
| **5,000** | 5,236 | 250 | 4 ms | 23 ms | 37 ms | 0.00% | 26,179 | **✓ PASS** |
| **10,000** | 10,423 | 500 | 6 ms | 21 ms | 37 ms | 0.00% | 52,122 | **✓ PASS** |
| **20,000** | 20,635 | 1,000 | 13 ms | 36 ms | 58 ms | 0.00% | 103,175 | **✓ PASS** |
| **30,000** | 30,861 | 1,500 | 22 ms | 56 ms | **91 ms** | **0.00%** | **154,310** | **✓ PASS** |
| **40,000** | 41,053 | 2,000 | 32 ms | 81 ms | 131 ms | 0.00% | 205,247 | **Peak Tested** |

### 2. WRITE Mode Benchmark (Durable `POST /orders` to SQLite WAL on gp3 SSD):
| Target RPS | Achieved Writes/s | Connections | p50 Latency | p97.5 Latency | p99 Latency | Error Rate | Durable Orders | Status |
|---|---|---|---|---|---|---|---|---|
| **500** | 526 | 50 | 5 ms | 30 ms | 48 ms | 0.00% | 2,628 | **✓ PASS** |
| **1,000** | 1,010 | 50 | 4 ms | 20 ms | 25 ms | 0.00% | 5,052 | **✓ PASS** |
| **2,000** | 2,011 | 100 | 13 ms | 31 ms | 40 ms | 0.00% | 10,056 | **✓ PASS** |
| **5,000** | 4,972 | 250 | 36 ms | 65 ms | 103 ms | 0.00% | 24,856 | **Peak Tested** |

### 3. Data Reconciliation Audit on EC2:
- **Total Durable Orders Audited:** 43,036
- **Accounting Violations:** 0
- **Negative Stock Count:** 0
- **Duplicate Purchases:** 0
- **Result:** **100% PASSED** (All 7 sale invariants verified).

---

## 6. Official Rulebook Compliance Audit

| Requirement | Spec Value | Server Implementation | Status |
|---|---|---|---|
| Listening Port & Host | `0.0.0.0:8080` | `0.0.0.0:8080` in `src/server.js` | **PASS** |
| Ready Check | `GET /health` $\to$ 200 `{"status":"ok"}` | Implemented in `src/routes/health.js` | **PASS** |
| Create Product | `POST /products` $\to$ 201, 400, 409 | Exact schema validation in `src/routes/products.js` | **PASS** |
| Read Product | `GET /products/:id` $\to$ 200, 404 | Fast pre-encoded buffer cache + DB fallback | **PASS** |
| Category Listing | `GET /products?category=...` | Price ASC, ID ASC tie-break + 1.9s memory cache | **PASS** |
| Buy One Unit | `POST /orders` $\to$ 201, 400, 404, 409 | Atomic conditional decrement in transaction | **PASS** |
| User Orders | `GET /users/:userId/orders` | 200 with `{ userId, orders: [] }` | **PASS** |
| Invariant 1 (No Overselling) | $\le$ initial stock | Database atomic check `WHERE stock > 0` | **PASS** |
| Invariant 2 (Exact Accounting) | $\Delta \text{Stock} = \text{Orders}$ | Strict 1-to-1 reservation in single transaction | **PASS** |
| Invariant 3 (No Negative Stock) | Stock $\ge 0$ | SQL constraint `CHECK (stock >= 0)` | **PASS** |
| Invariant 4 (One per customer) | Unique user/product | SQL constraint `UNIQUE (user_id, product_id)` | **PASS** |
| Invariant 5 (No Lost Orders) | Durable disk orders | SQLite WAL persisted to disk | **PASS** |
| Invariant 6 (No Ghost Orders) | Errors don't save orders | Rollback on error in transaction | **PASS** |
| Invariant 7 (Sell-Through) | Drops hit 0 stock | Purchases always use exact authoritative stock | **PASS** |
| 2-Second Read Cache | Stock $\le 2\text{s}$ stale | Cache TTL set to 1.9s buffer | **PASS** |
| Offline Boot | No internet at restart | All dependencies vendored, zero external calls | **PASS** |

---

## 7. Useful Operational Commands on EC2

```bash
# SSH into EC2 instance
ssh -i student-25.pem ubuntu@54.245.145.148

# Check live cluster status
sudo systemctl status last-server-standing

# Run tests directly on EC2
cd /home/ubuntu/EC2--Last-Server-Standing
npm test
npm run test:concurrency
npm run test:reconciliation

# Run progressive capacity benchmark on EC2
LOAD_MODE=read RPS_STEPS=5000,10000,20000,30000,40000,50000 STEP_DURATION=5 node tests/load/manual-ramp.js
LOAD_MODE=write RPS_STEPS=500,1000,2000,5000 STEP_DURATION=5 node tests/load/manual-ramp.js
```
