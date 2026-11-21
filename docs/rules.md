# Official Competition Rulebook & Specifications
# Last Server Standing — Rules & API Spec v1.1

---

## 1. Authoritative Rules Disclaimer
This document contains the exact rules, constraints, API specifications, and grading policies defined in the official competition specification `last-server-standing-rules.html` (dated 18 November 2026, Sheryians Coding School — KODR).

> [!IMPORTANT]
> The official rules outlined in this document are non-negotiable. Any violation of sale invariants, infrastructure boundaries, or endpoint contracts will result in immediate disqualification or test run failure.

---

## 2. Server Environment & Hardware Constraints

| Specification | Official Rule |
|---|---|
| **Instance Type** | AWS EC2 `m7i.large` |
| **CPU** | 2 vCPU — 1 physical core with 2 hyperthreads (4th Gen Intel Xeon) |
| **Memory** | 8 GiB RAM |
| **Storage** | 30 GiB gp3 SSD (3,000 baseline IOPS, 125 MB/s throughput) |
| **Operating System** | Ubuntu Server 24.04 LTS (x86_64) |
| **Location** | Same AWS availability zone as the benchmark load generator |
| **Listening Address** | `0.0.0.0:8080` (all interfaces, NOT `127.0.0.1`, NOT port 3000/5000) |
| **Protocol** | Plain HTTP/1.1 with persistent keep-alive. No HTTPS. |
| **Payload Format** | `application/json` for requests and responses. |

---

## 3. Network & Security Rules

| Stage | SSH (Port 22) | Outbound Internet (apt, npm, git) | Port 8080 | Other Ports |
|---|---|---|---|---|
| **Build Phase** | OPEN | OPEN | Load generator only | CLOSED |
| **After Code Freeze** | **CLOSED** | **BLOCKED** | Load generator only | CLOSED |

- **Port 8080 Access:** Port 8080 is NEVER exposed to the public internet. Participants access their API from laptops via SSH tunnel:
  ```bash
  ssh -i your-key.pem -N -L 8080:localhost:8080 ubuntu@<public-ip>
  ```
- **Strictly Prohibited:**
  - Scanning, connecting to, or load-testing other participants' instances.
  - Touching the benchmark load generator or AWS account.
  - Using any external service outside the single machine (MongoDB Atlas, AWS RDS, Managed Redis, Supabase, Firebase, or external laptops).
  - Inspecting benchmark IP, headers, or user-agent to return special-cased or hardcoded responses.

---

## 4. Complete API Endpoint Specification

### Global Conventions:
- **Base URL:** `http://<private-ip>:8080`. No `/api` prefix.
- **IDs:** Strings between 1 and 64 alphanumeric characters (lowercase letters and digits).
- **Price:** Integer $\ge 0$ (rupees).
- **Stock:** Integer $\ge 0$.
- **Error Format:** `{ "error": "CODE" }` (optional `message` allowed, but `error` code is strictly tested).
- **Extra Fields:** Ignored everywhere (e.g. `_id`, `__v` do not break tests).
- **Missing Fields:** Considered a **wrong answer** ($0$ tolerance).

### The Five Official Error Codes:
1. `400 VALIDATION_ERROR`: Required field/param missing, empty, or wrong type.
2. `404 PRODUCT_NOT_FOUND`: No product exists with the given ID.
3. `409 PRODUCT_EXISTS`: `POST /products` attempted with an ID already in use.
4. `409 ALREADY_PURCHASED`: User already has an accepted order for this product.
5. `409 SOLD_OUT`: Product stock is 0.

---

### Endpoint Specifications:

#### 1. Ready Check — `GET /health`
- **Purpose:** Polled once per second prior to test execution.
- **Status 200 OK:**
  ```json
  { "status": "ok" }
  ```
- **Status 503 (or any non-200):** Returned if database is connecting, indexes are compiling, or preloads are in progress.
  ```json
  { "status": "starting" }
  ```

#### 2. Create Product — `POST /products`
- **Request Schema:**
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
  - `id`: String, 1–64 characters, unique.
  - `name`: String, 1–200 characters.
  - `category`: String, 1–64 characters.
  - `price`: Integer $\ge 0$.
  - `stock`: Integer $\ge 0$.
- **Responses:**
  - `201 Created`: The product object exactly as stored.
  - `400 Bad Request`: `{ "error": "VALIDATION_ERROR" }`
  - `409 Conflict`: `{ "error": "PRODUCT_EXISTS" }` (existing product remains unchanged).

#### 3. Read Product — `GET /products/:id`
- **Traffic Share:** 60% of all benchmark traffic.
- **Responses:**
  - `200 OK`: Stored product object.
    ```json
    {
      "id": "p3f9a0c2e71bd",
      "name": "Pixel 10 Pro 256GB",
      "category": "c8d21fa",
      "price": 79999,
      "stock": 119
    }
    ```
  - `404 Not Found`: `{ "error": "PRODUCT_NOT_FOUND" }`
- **Freshness:** `stock` may be up to 2 seconds stale. `name`, `category`, `price` are immutable.

#### 4. List Products by Category — `GET /products?category=...&page=...&limit=...`
- **Traffic Share:** 15% of all benchmark traffic.
- **Parameters:**
  - `category` (Required, string): Missing or empty $\to$ `400 VALIDATION_ERROR`.
  - `page` (Optional integer $\ge 1$, default 1): Invalid $\to$ `400 VALIDATION_ERROR`.
  - `limit` (Optional integer 1–50, default 20): Invalid $\to$ `400 VALIDATION_ERROR`.
- **Sorting Requirement:** Sorted primarily by `price` ascending. Ties broken by `id` ascending (standard lexicographical sort).
- **Responses:**
  - `200 OK`:
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
  - Non-existent category: 200 OK with `"items": []` and `"total": 0`.
  - Page beyond range: 200 OK with `"items": []` and real `"total"`.
  - Invalid parameters: 400 Bad Request with `{ "error": "VALIDATION_ERROR" }`.

#### 5. Buy One Unit — `POST /orders`
- **Traffic Share:** 20% of all benchmark traffic.
- **Request Schema:**
  ```json
  {
    "userId": "u7b0e44c19a2f",
    "productId": "p3f9a0c2e71bd"
  }
  ```
- **Rules:**
  - Buys exactly 1 unit.
  - A user can purchase each product at most once ever.
  - `orderId`: Unique non-empty string.
- **Validation Precedence:**
  1. 400 `VALIDATION_ERROR` (missing, empty, or non-string `userId` or `productId`).
  2. 404 `PRODUCT_NOT_FOUND` (no product with that ID).
  3. 409 `ALREADY_PURCHASED` or `SOLD_OUT`. If user already owns the product AND it is sold out, **either** 409 code is accepted.
- **Responses:**
  - `201 Created`:
    ```json
    {
      "orderId": "o_5f2a9c",
      "userId": "u7b0e44c19a2f",
      "productId": "p3f9a0c2e71bd"
    }
    ```
  - `400 Bad Request`: `{ "error": "VALIDATION_ERROR" }`
  - `404 Not Found`: `{ "error": "PRODUCT_NOT_FOUND" }`
  - `409 Conflict`: `{ "error": "ALREADY_PURCHASED" }`
  - `409 Conflict`: `{ "error": "SOLD_OUT" }`

#### 6. User Order History — `GET /users/:userId/orders`
- **Traffic Share:** 5% of all benchmark traffic.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "userId": "u7b0e44c19a2f",
      "orders": [
        { "orderId": "o_5f2a9c", "productId": "p3f9a0c2e71bd" },
        { "orderId": "o_91c07e", "productId": "p0c4be91a3f25" }
      ]
    }
    ```
  - User with no orders: 200 OK with `"orders": []` (never 404).
  - Array order: Arbitrary (evaluated as an unordered set).
  - Stale read: May be up to 2 seconds stale.

---

## 5. The Seven Mandatory Sale Invariants

Disqualification occurs if any invariant is violated:

1. **NO OVERSELLING:** Successful orders for any product must never exceed initial stock.
2. **EXACT STOCK ACCOUNTING:** $\text{Final Stock} = \text{Initial Stock} - \text{Successful Orders}$.
3. **NO NEGATIVE STOCK:** Stock must never be below zero in any response or database record.
4. **ONE PURCHASE PER CUSTOMER:** A user can never receive more than one HTTP 201 for a product, even during simultaneous duplicate requests.
5. **NO LOST ORDERS:** Every order accepted with HTTP 201 must appear in the user's order list.
6. **NO GHOST ORDERS:** Failed purchases must never create orders or take stock.
7. **FLASH SALE SELL-THROUGH:** Every flash drop must finish at stock 0 because the benchmark sends far more buyers than available units. Never reject buyers using outdated cached stock.

---

## 6. Official Test Pipeline & Traffic Profile

### Stages:
1. **Code Freeze:** Outbound internet cut, SSH disabled.
2. **Functional Check (~1 min, 40 requests):** Tests every route and error case. **Must be 100% correct.** One failure terminates the run.
3. **Database Seeding (max 3 min):** 10,000 products created across 50 categories via 50 concurrent requests. Each product has 100,000 units.
4. **Warm-up (60s @ 200 req/s):** Unscored real traffic mix.
5. **The Ramp (30s per level):** Stepped traffic load up to Level 17. 1 new flash drop product per level.
6. **Settle and Audit:** Traffic stops, 3-second wait, then full consistency audit across all database tables and order lists.

### Benchmark RPS Tiers:
| Level | Rate | Total Requests in 30s | Level | Rate | Total Requests in 30s |
|---|---|---|---|---|---|
| **L1** | 500 req/s | 15,000 | **L10** | 10,000 req/s | 300,000 |
| **L2** | 1,000 req/s | 30,000 | **L11** | 12,500 req/s | 375,000 |
| **L3** | 1,500 req/s | 45,000 | **L12** | 15,000 req/s | 450,000 |
| **L4** | 2,000 req/s | 60,000 | **L13** | 20,000 req/s | 600,000 |
| **L5** | 3,000 req/s | 90,000 | **L14** | 25,000 req/s | 750,000 |
| **L6** | 4,000 req/s | 120,000 | **L15** | 30,000 req/s | 900,000 |
| **L7** | 5,000 req/s | 150,000 | **L16** | 40,000 req/s | 1,200,000 |
| **L8** | 6,500 req/s | 195,000 | **L17** | 50,000 req/s | 1,500,000 |
| **L9** | 8,000 req/s | 240,000 | | | |

### Traffic Distribution:
- `GET /products/:id`: 60% (~2% non-existent IDs $\to$ 404).
- `GET /products?category=...`: 15% (random category, mostly page 1, up to page 10, limit 10, 20, or 50).
- `POST /orders`: 20% (70% flash drop, 30% regular products; 3% retries $\to$ 409, 2% double-clicks).
- `GET /users/:userId/orders`: 5%.
- `POST /products`: 1 per level (the flash drop, stock 50–200).

---

## 7. Pass Criteria, Error Budgets & Disqualifications

### Level Passing Requirements:
1. **p99 Latency:** $\le 100\text{ ms}$ across all requests in the level.
2. **Error Rate:** $\le 1.0\%$ of requests (includes timeouts $> 2\text{s}$, connection refused/reset, 5xx, 429).
3. **Wrong Answers:** **Exactly 0.** (Zero tolerance for wrong HTTP code, invalid JSON, or incorrect sorting).

### Disqualification Triggers:
- Violating any of the 7 sale invariants during audit.
- Using cloud databases or external machines.
- Spotting the load generator IP or returning hardcoded data.
- Storing data only in volatile memory (goldfish database).
- Rate limiting the load generator (returning 429s).
