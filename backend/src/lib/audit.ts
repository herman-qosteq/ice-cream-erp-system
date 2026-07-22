import { prisma } from './prisma';
import { broadcastExcept } from '../realtime';

// Server-side equivalent of logAudit() in the frontend's storage.ts.
// user_id is intentionally NOT a foreign key (see schema.prisma) so the
// 'system' pseudo-actor and deleted users never break an insert here.
//
// Called as a side effect from inside other services' mutations (orders,
// payments, prebookings, purchases, ...), not via its own POST route - so
// app.ts's generic per-route `data:changed` broadcast never fires an
// 'audit-logs' event on its own. Broadcast it explicitly here instead, so a
// mounted Movement Logs screen refreshes on every action that logs an entry,
// not just direct settings writes. No request/socket-id context is available
// this deep in the call stack, so this broadcasts to every connected socket
// including the acting user's own tab - harmless, since a resource-aware
// refetch of the current page/cursor is cheap and idempotent.
export async function logAudit(params: {
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  details: string;
}) {
  let user_name: string | undefined;
  let user_role: string | undefined;

  if (params.user_id === 'system') {
    user_name = 'System';
    user_role = 'System';
  } else {
    const user = await prisma.user.findUnique({ where: { id: params.user_id } });
    user_name = user ? user.name.replace(/\s*\([^)]*\)\s*$/, '').trim() : params.user_id;
    user_role = user ? user.role : 'Unknown';
  }

  await prisma.auditLog.create({
    data: { ...params, user_name, user_role },
  });

  broadcastExcept(undefined, 'data:changed', { resource: 'audit-logs', method: 'POST' });
}
