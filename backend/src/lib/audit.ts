import { prisma } from './prisma';

// Server-side equivalent of logAudit() in the frontend's storage.ts.
// user_id is intentionally NOT a foreign key (see schema.prisma) so the
// 'system' pseudo-actor and deleted users never break an insert here.
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
}
