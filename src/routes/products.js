import {
  createProduct,
  getProductById,
  listProductsByCategory,
} from '../services/productService.js';
import { validationError } from '../utils/errors.js';

export default async function productRoutes(fastify) {
  // POST /products - Create a product
  fastify.post('/products', async (request, reply) => {
    const body = request.body;

    if (!body || typeof body !== 'object') {
      throw validationError('Request body must be a JSON object');
    }

    const { id, name, category, price, stock } = body;

    // Validate ID
    if (typeof id !== 'string' || id.trim().length === 0 || id.length > 64) {
      throw validationError('id must be a non-empty string up to 64 characters');
    }

    // Validate Name
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) {
      throw validationError('name must be a non-empty string up to 200 characters');
    }

    // Validate Category
    if (typeof category !== 'string' || category.trim().length === 0 || category.length > 64) {
      throw validationError('category must be a non-empty string up to 64 characters');
    }

    // Validate Price (integer >= 0)
    if (typeof price !== 'number' || !Number.isInteger(price) || price < 0) {
      throw validationError('price must be a whole number >= 0');
    }

    // Validate Stock (integer >= 0)
    if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0) {
      throw validationError('stock must be a whole number >= 0');
    }

    const product = createProduct({ id, name, category, price, stock });
    return reply.status(201).send(product);
  });

  // GET /products/:id - Read one product
  fastify.get('/products/:id', async (request, reply) => {
    const { id } = request.params;
    if (!id || typeof id !== 'string') {
      throw validationError('Invalid product ID');
    }

    const product = getProductById(id);
    if (product.rawBuffer) {
      return reply.type('application/json').send(product.rawBuffer);
    }
    if (product.rawJson) {
      return reply.type('application/json').send(product.rawJson);
    }
    return reply.status(200).send(product);
  });

  // GET /products?category=...&page=...&limit=... - List a category
  fastify.get('/products', async (request, reply) => {
    const { category, page: pageRaw, limit: limitRaw } = request.query;

    // Validate category (Required, non-empty string)
    if (typeof category !== 'string' || category.trim().length === 0) {
      throw validationError('category query parameter is required and must be non-empty');
    }

    // Validate page (Optional, integer >= 1, default 1)
    let page = 1;
    if (pageRaw !== undefined) {
      const pageStr = String(pageRaw);
      if (!/^\d+$/.test(pageStr)) {
        throw validationError('page must be an integer >= 1');
      }
      page = parseInt(pageStr, 10);
      if (page < 1) {
        throw validationError('page must be >= 1');
      }
    }

    // Validate limit (Optional, integer 1-50, default 20)
    let limit = 20;
    if (limitRaw !== undefined) {
      const limitStr = String(limitRaw);
      if (!/^\d+$/.test(limitStr)) {
        throw validationError('limit must be an integer between 1 and 50');
      }
      limit = parseInt(limitStr, 10);
      if (limit < 1 || limit > 50) {
        throw validationError('limit must be between 1 and 50');
      }
    }

    const result = listProductsByCategory({ category, page, limit });
    return reply.status(200).send(result);
  });
}
