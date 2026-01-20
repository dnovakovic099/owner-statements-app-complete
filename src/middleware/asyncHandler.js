/**
 * Async Handler Middleware
 *
 * Wraps async route handlers to automatically catch errors and pass them
 * to Express's error handling middleware. Eliminates the need for try-catch
 * blocks in every route handler.
 *
 * Usage:
 *   const asyncHandler = require('../middleware/asyncHandler');
 *
 *   router.get('/endpoint', asyncHandler(async (req, res) => {
 *       const data = await someAsyncOperation();
 *       res.json(data);
 *   }));
 *
 * Benefits:
 *   - Reduces boilerplate try-catch in routes
 *   - Consistent error handling across all routes
 *   - Automatically passes errors to global error handler
 */

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
