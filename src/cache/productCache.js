import { config } from '../config/env.js';

class ProductCache {
  constructor() {
    this.cache = new Map();
  }

  get(id) {
    const item = this.cache.get(id);
    if (!item) return null;

    // Check if stock is still fresh within the 2-second rule
    const now = Date.now();
    if (now - item.cachedAt > config.stockCacheTtlMs) {
      return null; // Expired stock, force DB refresh
    }

    return item;
  }

  set(product) {
    const rawJson = JSON.stringify({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
    });
    const rawBuffer = Buffer.from(rawJson);

    const cachedItem = {
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      cachedAt: Date.now(),
      rawJson,
      rawBuffer,
    };
    this.cache.set(product.id, cachedItem);
    return cachedItem;
  }

  updateStock(id, newStock) {
    const item = this.cache.get(id);
    if (item) {
      item.stock = newStock;
      item.cachedAt = Date.now();
      item.rawJson = JSON.stringify({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        stock: newStock,
      });
      item.rawBuffer = Buffer.from(item.rawJson);
    }
  }

  delete(id) {
    this.cache.delete(id);
  }

  clear() {
    this.cache.clear();
  }
}

export const productCache = new ProductCache();
