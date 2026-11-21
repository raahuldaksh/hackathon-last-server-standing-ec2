# Product Requirements Document (PRD)
# Last Server Standing — High-Performance Flash Sale API

---

## 1. Executive Summary
**Project:** Last Server Standing  
**Organization:** Sheryians Coding School — KODR  
**Specification:** Rules & API Spec v1.1  
**Date:** 18 November 2026  
**Target Environment:** AWS EC2 `m7i.large` (2 vCPU, 8 GiB RAM, 30 GiB gp3 SSD, Ubuntu Server 24.04 LTS)  
**Language/Runtime:** Node.js (JavaScript, Modern ES Modules)

"Last Server Standing" is a backend engineering competition designed to benchmark server architecture, high-concurrency correctness, and low-latency performance under intense flash sale traffic. The server must handle up to 50,000 requests per second (RPS) distributed across 6 strictly defined REST endpoints, maintaining p99 latency $\le 100\text{ ms}$, error rate $\le 1\%$, zero wrong answers, and 100% accounting integrity across all orders and inventory.

---

## 2. Problem Statement
Flash sales present the hardest challenge in distributed systems and backend engineering:
1. **Extreme Concurrency Hotspots:** Thousands of concurrent buyers attempt to purchase a very limited quantity of stock (e.g., 50–200 units) at the exact same millisecond.
2. **Race Conditions & Overselling:** Conventional read-modify-write patterns (`product.stock -= 1; await product.save()`) lead to catastrophic overselling and negative stock under concurrency.
3. **Double-Click / Replay Attacks:** Concurrent duplicate requests from the same user must result in exactly one successful purchase, without race conditions permitting duplicate orders.
4. **Hardware Constraints:** All software (HTTP server, database, cache, workers) must run on a single 2-vCPU, 8 GiB RAM instance with zero external cloud services (no AWS RDS, no Redis Cloud, no Atlas).
5. **Durability vs. Throughput:** In-memory solutions that drop data on process crash are disqualified. All committed transactions must be durably persisted to local disk, yet serve high read throughput (up to 50,000 RPS).

---

## 3. Project Objectives
1. **Absolute Correctness (Priority #1):** Comply with all 7 mandatory sale invariants: No Overselling, Exact Stock Accounting, No Negative Stock, One Purchase Per Customer, No Lost Orders, No Ghost Orders, and Flash Sale Sell-Through.
2. **Low Latency & High Concurrency:** Achieve p99 latency $\le 100\text{ ms}$ under up to 5,000 concurrent keep-alive connections.
3. **Resilience & Crash Recovery:** Self-recover within seconds after unexpected SIGKILL or process crashes without human intervention, maintaining 100% data consistency.
4. **Zero Internet Dependency at Runtime:** Self-contained execution without reliance on external network calls (`npm install`, external APIs, cloud databases).
5. **Benchmark Performance:** Pass the highest possible RPS level (from Level 1 at 500 RPS up to Level 17 at 50,000 RPS).

---

## 4. Scope and Non-Scope

### In-Scope:
- Implementation of exactly 6 REST endpoints matching the v1.1 specification.
- Local persistent database on the EC2 instance (e.g., SQLite in WAL mode / local PostgreSQL / local MongoDB).
- Atomic inventory reservation and deduplication logic.
- Compliant 2-second caching policy for reads.
- Automated functional, concurrency, and load testing suites.
- Process supervision (systemd) for automatic crash recovery.
- Operational runbooks for deployment and monitoring.

### Out-of-Scope:
- Frontend user interfaces, admin dashboards, or client HTML pages.
- Authentication, authorization, OAuth, or JWT tokens (competition explicitly requires no auth).
- Payment gateways, shopping carts, shipping logistics, or billing calculations.
- External cloud databases, distributed microservices, or multi-node clustering.
- HTTPS/TLS (plain HTTP/1.1 on port 8080 required).

---

## 5. System Actors
1. **Benchmark Load Generator:** Automated test harness executing functional verification, 10,000-product seeding, 60s warm-up, and 17 stepped load levels from a single IP.
2. **Post-Test Auditor:** Automated auditor that verifies database records against all accepted 201 responses, stock balances, and user order histories after a 3-second settle period.
3. **System Administrator / Student Engineer:** Responsible for building, deploying, monitoring, and debugging the server locally and via SSH tunnel.

---

## 6. Functional Requirements & Endpoint Contracts

### Global Protocol Requirements:
- **Port & Host:** `0.0.0.0:8080` (all network interfaces).
- **Protocol:** HTTP/1.1 with persistent keep-alive.
- **Content-Type:** `application/json` for all request and response bodies.
- **Base Path:** Root `/` (no `/api` prefix).
- **Identifier Format:** Strings between 1 and 64 characters (alphanumeric).
- **Price Format:** Non-negative integers (in Indian Rupees ₹).
- **Stock Format:** Non-negative integers.
- **Allowed Error Codes:** Exactly 5 official codes:
  1. `400 VALIDATION_ERROR`
  2. `404 PRODUCT_NOT_FOUND`
  3. `409 PRODUCT_EXISTS`
  4. `409 ALREADY_PURCHASED`
  5. `409 SOLD_OUT`

---

### Endpoint 1: Ready Check
- **Path:** `GET /health`
- **Purpose:** Polled once per second prior to test execution to determine server readiness.
- **Success Response (200 OK):**
  ```json
  { "status": "ok" }
  ```
- **Not Ready Response (503 Service Unavailable or any non-200):**
  ```json
  { "status": "starting" }
  ```
- **Acceptance Criteria:** Returns 200 ONLY after the database is connected, schemas/indexes are ready, and any preloaded data is warmed up.

---

### Endpoint 2: Create Product
- **Path:** `POST /products`
- **Purpose:** Used during Stage 2 seeding (10,000 products) and at the start of each load level (1 flash drop product).
- **Request Body:**
  ```json
  {
    "id": "p3f9a0c2e71bd",
    "name": "Pixel 10 Pro 256GB",
    "category": "c8d21fa",
    "price": 79999,
    "stock": 120
  }
  ```
- **Validation Rules:**
  - `id`: Required string, 1–64 chars. Must be unique.
  - `name`: Required string, 1–200 chars.
  - `category`: Required string, 1–64 chars.
  - `price`: Required integer, $\ge 0$.
  - `stock`: Required integer, $\ge 0$.
- **Responses:**
  - **201 Created:** Returns the exact product object as stored:
    ```json
    {
      "id": "p3f9a0c2e71bd",
      "name": "Pixel 10 Pro 256GB",
      "category": "c8d21fa",
      "price": 79999,
      "stock": 120
    }
    ```
  - **400 Bad Request:** Missing/empty field, wrong type, negative price/stock:
    ```json
    { "error": "VALIDATION_ERROR" }
    ```
  - **409 Conflict:** Product ID already taken. Existing product remains untouched:
    ```json
    { "error": "PRODUCT_EXISTS" }
    ```

---

### Endpoint 3: Read One Product
- **Path:** `GET /products/:id`
- **Traffic Share:** 60% of all benchmark traffic.
- **Responses:**
  - **200 OK:**
    ```json
    {
      "id": "p3f9a0c2e71bd",
      "name": "Pixel 10 Pro 256GB",
      "category": "c8d21fa",
      "price": 79999,
      "stock": 119
    }
    ```
  - **404 Not Found:**
    ```json
    { "error": "PRODUCT_NOT_FOUND" }
    ```
- **Caching Policy:** `stock` may be up to 2 seconds stale. `name`, `category`, and `price` are immutable and may be cached indefinitely.

---

### Endpoint 4: List Products by Category
- **Path:** `GET /products?category=...&page=...&limit=...`
- **Traffic Share:** 15% of all benchmark traffic.
- **Query Parameters:**
  - `category`: **Required**, non-empty string. If missing or empty $\to$ `400 VALIDATION_ERROR`.
  - `page`: Optional integer $\ge 1$, default `1`. If invalid $\to$ `400 VALIDATION_ERROR`.
  - `limit`: Optional integer between `1` and `50`, default `20`. If invalid $\to$ `400 VALIDATION_ERROR`.
- **Sorting Specification:** Sort primarily by `price` ascending. Tie-break equal prices by `id` ascending (lexicographical string sort).
- **Pagination Rules:**
  - `total`: Total count of all products in that category across all pages.
  - Page beyond total items: Returns HTTP 200 with `"items": []` and accurate `total`.
  - Empty category: Returns HTTP 200 with `"items": []` and `"total": 0`.
  - Stale stock: `stock` in items may be up to 2 seconds old.
- **Success Response (200 OK):**
  ```json
  {
    "items": [
      { "id": "p0c4be91a3f25", "name": "Steel Bottle 1L", "category": "c8d21fa", "price": 349, "stock": 99999 },
      { "id": "p7d2e05b1c9aa", "name": "Phone Case", "category": "c8d21fa", "price": 349, "stock": 99987 }
    ],
    "page": 1,
    "limit": 2,
    "total": 214
  }
  ```

---

### Endpoint 5: Buy One Unit
- **Path:** `POST /orders`
- **Traffic Share:** 20% of all benchmark traffic (70% to active flash drop, 30% to regular catalog).
- **Request Body:**
  ```json
  {
    "userId": "u7b0e44c19a2f",
    "productId": "p3f9a0c2e71bd"
  }
  ```
- **Rules:**
  - Buys exactly 1 unit.
  - One user can purchase a given product at most once ever.
  - `orderId`: Non-empty string, globally unique across all orders.
- **Validation & Error Precedence:**
  1. `400 VALIDATION_ERROR` (if `userId` or `productId` missing, empty, or non-string).
  2. `404 PRODUCT_NOT_FOUND` (if product does not exist).
  3. `409 ALREADY_PURCHASED` (user has existing order for this product) OR `409 SOLD_OUT` (stock = 0). If both apply, either 409 is accepted.
- **Responses:**
  - **201 Created:**
    ```json
    {
      "orderId": "o_5f2a9c",
      "userId": "u7b0e44c19a2f",
      "productId": "p3f9a0c2e71bd"
    }
    ```
  - **400 Bad Request:** `{ "error": "VALIDATION_ERROR" }`
  - **404 Not Found:** `{ "error": "PRODUCT_NOT_FOUND" }`
  - **409 Conflict (Duplicate):** `{ "error": "ALREADY_PURCHASED" }`
  - **409 Conflict (Stock 0):** `{ "error": "SOLD_OUT" }`
- **Atomicity:** Any error must leave database state completely untouched (no stock decrement, no order recorded).

---

### Endpoint 6: User Order History
- **Path:** `GET /users/:userId/orders`
- **Traffic Share:** 5% of all benchmark traffic.
- **Rules:**
  - Returns array of accepted orders for `:userId`.
  - User with zero orders returns HTTP 200 with `"orders": []` (never 404).
  - Array item order is arbitrary (compared as a set).
  - May be up to 2 seconds stale.
- **Success Response (200 OK):**
  ```json
  {
    "userId": "u7b0e44c19a2f",
    "orders": [
      { "orderId": "o_5f2a9c", "productId": "p3f9a0c2e71bd" },
      { "orderId": "o_91c07e", "productId": "p0c4be91a3f25" }
    ]
  }
  ```

---

## 7. Business Rules & Seven Sale Invariants
1. **Invariant 1 — No Overselling:** $\text{Successful Orders} \le \text{Initial Stock}$.
2. **Invariant 2 — Exact Stock Accounting:** $\text{Final Stock} = \text{Initial Stock} - \text{Successful Orders}$.
3. **Invariant 3 — No Negative Stock:** Product stock must never drop below 0 in any response or database record.
4. **Invariant 4 — One Purchase Per Customer:** A user must receive at most one HTTP 201 per product lifetime, even under parallel double-click requests.
5. **Invariant 5 — No Lost Orders:** Every 201 response received by the benchmark client must be durably stored and present in `GET /users/:userId/orders`.
6. **Invariant 6 — No Ghost Orders:** Orders must never be stored for failed purchase attempts.
7. **Invariant 7 — Flash Sale Sell-Through:** All units in flash drop products must be sold out ($\text{stock} = 0$) because the benchmark supplies far more buyers than available units. Never reject legitimate orders using outdated cache.

---

## 8. Non-Functional Requirements
- **Throughput & Latency:** p99 response time $\le 100\text{ ms}$ under up to 50,000 req/s.
- **Error Budget:** Total errors $\le 1.0\%$ across any 30s level (timeouts, 5xx, 429, resets).
- **Correctness:** Exactly 0 wrong answers across all levels.
- **Concurrency:** Support up to 5,000 persistent keep-alive TCP connections simultaneously.
- **Resource Footprint:** Must execute strictly within 2 vCPUs and 8 GiB RAM.
- **Persistence & Durability:** Full durability on local SSD (3,000 IOPS, 125 MB/s).
- **Recovery:** Unattended automatic restart after process termination within $< 5$ seconds.

---

## 9. Failure Scenarios & Mitigations
- **Scenario A: High contention on flash sale product (thousands of writes/sec on 1 row).**  
  *Mitigation:* Single atomic database query (`UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0`) or serial batching to avoid deadlocks.
- **Scenario B: Simultaneous duplicate order ("double-click").**  
  *Mitigation:* Unique composite constraint `UNIQUE(user_id, product_id)` in database. Duplicate insert triggers constraint violation, rollback, and 409 response.
- **Scenario C: Sudden process crash (SIGKILL).**  
  *Mitigation:* Systemd service with `Restart=always` and `RestartSec=1`. Database engine uses write-ahead logging (WAL) with immediate crash recovery.
- **Scenario D: Connection pool exhaustion under 5,000 concurrent clients.**  
  *Mitigation:* HTTP keep-alive optimization, non-blocking asynchronous event loop, fast in-memory LRU cache for 60% read queries.

---

## 10. Success Metrics
- 100% pass rate on Stage 1 Functional Check (~40 requests).
- Flawless completion of Stage 2 Seeding (10,000 products created in $< 3$ minutes).
- Zero audit violations during Stage 6 reconciliation.
- Achievement of highest possible RPS tier ($\ge$ Level 10 / 10,000 RPS target on 2 vCPU).
