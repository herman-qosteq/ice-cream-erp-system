import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken, AuthTokenPayload } from '../lib/jwt';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../lib/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

// Re-checks the user against the DB on every request (not just the JWT
// signature/expiry) so that disabling a user or changing their role takes
// effect immediately instead of waiting out the token's 7-day lifetime.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing bearer token'));
  }
  try {
    const payload = verifyAuthToken(header.slice('Bearer '.length));
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status === 'Inactive') {
      return next(ApiError.unauthorized('Your session is no longer valid. Please log in again.'));
    }
    req.auth = { sub: user.id, role: user.role };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}

export function requireRole(...roles: AuthTokenPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(ApiError.forbidden('Insufficient role'));
    next();
  };
}
