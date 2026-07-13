import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { logAudit } from '../../lib/audit';
import { ApiError } from '../../utils/ApiError';

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { created_at: 'asc' } });
}

export async function createUser(input: { name: string; phone: string; role: 'Admin' | 'Salesperson' | 'Warehouse'; password_hash: string }, actorId: string) {
  const user = await prisma.user.create({
    data: { ...input, password_hash: bcrypt.hashSync(input.password_hash, 10), status: 'Active' },
  });
  await logAudit({ action: 'USER_CREATE', entity_type: 'User', entity_id: user.id, user_id: actorId, details: `Registered new operator: ${user.name} (${user.role})` });
  return user;
}

export async function updateUser(id: string, input: { name?: string; phone?: string; role?: 'Admin' | 'Salesperson' | 'Warehouse'; status?: 'Active' | 'Inactive' }, actorId: string) {
  const user = await prisma.user.update({ where: { id }, data: input });
  await logAudit({ action: 'USER_EDIT', entity_type: 'User', entity_id: id, user_id: actorId, details: `Modified details of operator: ${user.name}` });
  return user;
}

export async function toggleUserStatus(id: string, actorId: string) {
  if (id === actorId) throw ApiError.badRequest('You cannot disable your own active administrator account!');

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('User not found');

  const nextStatus = existing.status === 'Active' ? 'Inactive' : 'Active';
  const user = await prisma.user.update({ where: { id }, data: { status: nextStatus } });
  await logAudit({ action: 'USER_TOGGLE', entity_type: 'User', entity_id: id, user_id: actorId, details: `Toggled status of operator ${user.name} to ${nextStatus}` });
  return user;
}

export async function resetPassword(id: string, newPassword: string, actorId: string) {
  if (!newPassword.trim()) throw ApiError.badRequest('Password cannot be empty.');
  const user = await prisma.user.update({ where: { id }, data: { password_hash: bcrypt.hashSync(newPassword, 10) } });
  await logAudit({ action: 'USER_PASSWORD_RESET', entity_type: 'User', entity_id: id, user_id: actorId, details: `Password reset for operator ${user.name}` });
  return { id: user.id };
}
