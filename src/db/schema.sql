-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL CHECK(price >= 0),
    stock INTEGER NOT NULL CHECK(stock >= 0),
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Index for category listing: exact match on category, pre-sorted by price ASC, then id ASC
CREATE INDEX IF NOT EXISTS idx_products_category_price_id 
ON products (category, price ASC, id ASC);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    CONSTRAINT uq_user_product UNIQUE (user_id, product_id)
);

-- Index for user order history lookups
CREATE INDEX IF NOT EXISTS idx_orders_user_id 
ON orders (user_id);
