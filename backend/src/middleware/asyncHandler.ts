import { Request, Response, NextFunction, RequestHandler } from 'express';

// Wraps an async route handler so rejected promises reach Express's error
// middleware instead of crashing the process.
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
