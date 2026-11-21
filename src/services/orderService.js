import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { productCache } from '../cache/productCache.js';
import {
  productNotFoundError,
  alreadyPurchasedError,
  soldOutError,
} from '../utils/errors.js';

let stmts = null;
let purchaseTx = null;

function getStatements() {
  if (stmts) return stmts;
  const db = getDatabase();

  stmts = {
    getProduct: db.prepare('SELECT id, stock FROM products WHERE id = ?'),
    checkExistingOrder: db.prepare(
      'SELECT 1 FROM orders WHERE user_id = ? AND product_id = ?'
    ),
    reserveStock: db.prepare(
      `UPDATE products
       SET stock = stock - 1
       WHERE id = ? AND stock > 0
         AND NOT EXISTS (
           SELECT 1 FROM orders WHERE user_id = ? AND product_id = ?
         )
       RETURNING stock`
    ),
    insertOrder: db.prepare(
      'INSERT INTO orders (order_id, user_id, product_id) VALUES (?, ?, ?)'
    ),
    getUserOrders: db.prepare(
      'SELECT order_id AS orderId, product_id AS productId FROM orders WHERE user_id = ?'
    ),
  };

  purchaseTx = db.transaction((userId, productId, orderId) => {
    const reservation = stmts.reserveStock.get(productId, userId, productId);
    if (!reservation) {
      // Race condition occurred; re-check authoritative state
      const p = stmts.getProduct.get(productId);
      if (!p) {
        return { error: productNotFoundError() };
      }
      if (stmts.checkExistingOrder.get(userId, productId)) {
        return { error: alreadyPurchasedError() };
      }
      return { error: soldOutError() };
    }

    stmts.insertOrder.run(orderId, userId, productId);

    return {
      success: true,
      remainingStock: reservation.stock,
    };
  });

  return stmts;
}

export function purchaseOrder(userId, productId) {
  getStatements();

  // Fast non-blocking read checks to avoid SQLite write-lock contention
  // In WAL mode, SELECT queries take shared read locks that never block other workers
  const product = stmts.getProduct.get(productId);
  if (!product) {
    throw productNotFoundError();
  }

  // Precedence: 400 (already checked) -> 404 (above) -> 409
  const existing = stmts.checkExistingOrder.get(userId, productId);
  if (existing) {
    throw alreadyPurchasedError();
  }

  if (product.stock <= 0) {
    throw soldOutError();
  }

  // Generate unique order ID
  const orderId = 'o_' + crypto.randomBytes(6).toString('hex');

  // Authoritative atomic reservation within transaction
  const result = purchaseTx(userId, productId, orderId);

  if (result.error) {
    throw result.error;
  }

  // Update in-memory cache stock immediately
  productCache.updateStock(productId, result.remainingStock);

  return {
    orderId,
    userId,
    productId,
  };
}

export function getUserOrders(userId) {
  const { getUserOrders: queryStmt } = getStatements();
  const rows = queryStmt.all(userId);

  return {
    userId,
    orders: rows.map((r) => ({
      orderId: r.orderId,
      productId: r.productId,
    })),
  };
}
