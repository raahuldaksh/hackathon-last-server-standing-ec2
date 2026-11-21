export class AppError extends Error {
  constructor(statusCode, errorCode, message) {
    super(message || errorCode);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export function validationError(message) {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

export function productNotFoundError() {
  return new AppError(404, 'PRODUCT_NOT_FOUND', 'No product with that id');
}

export function productExistsError() {
  return new AppError(409, 'PRODUCT_EXISTS', 'The product id is already taken');
}

export function alreadyPurchasedError() {
  return new AppError(409, 'ALREADY_PURCHASED', 'This user already bought this product');
}

export function soldOutError() {
  return new AppError(409, 'SOLD_OUT', "The product's stock is 0");
}
