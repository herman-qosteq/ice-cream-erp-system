import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken, AuthTokenPayload } from '../lib/jwt';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../lib/prisma';
import { hasExplicitScreenGrant, isAnyScreenAllowedForUser, ScreenRef } from '../lib/permissions';

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

// Like requireRole, but also lets through an operator who isn't one of
// nativeRoles when they've been individually granted one of the given
// screens via Manage Permissions. Manage Permissions writes a UserPermission
// row (see settings.service.ts / frontend's ManagePermissionsModal.tsx) that
// the frontend's own nav already honors (see isForeignScreenGranted() in
// frontend/src/utils/permissions.ts) - without this, granting e.g. the "Ice
// Cream Catalog" screen to a Warehouse operator would let them see the
// screen and its Create/Edit/Delete controls, but every write would still
// 403 here because requireRole never looked at the grant at all.
export function requireRoleOrScreenGrant(nativeRoles: AuthTokenPayload['role'][], ...screens: ScreenRef[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (nativeRoles.includes(req.auth.role)) return next();
    try {
      const granted = await hasExplicitScreenGrant(req.auth.sub, screens);
      if (!granted) return next(ApiError.forbidden('Insufficient role'));
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Fully override-aware version of requireRoleOrScreenGrant: native-role
// access here is ALSO individually revocable per operator (via an explicit
// UserPermission row), and a screen's defaultForRoles can extend "native"
// access to another role too (see isAnyScreenAllowedForUser). Used wherever
// that finer-grained control actually matters - e.g. the Warehouse cluster,
// where an Admin can revoke just "Trucks" for one Warehouse operator without
// touching the rest.
export function requireAnyScreenAccess(...screens: ScreenRef[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthorized());
    try {
      const allowed = await isAnyScreenAllowedForUser(req.auth.sub, req.auth.role, screens);
      if (!allowed) return next(ApiError.forbidden('Insufficient permission'));
      next();
    } catch (err) {
      next(err);
    }
  };
}
