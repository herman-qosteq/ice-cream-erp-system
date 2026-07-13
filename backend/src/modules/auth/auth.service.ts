import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { signAuthToken } from '../../lib/jwt';
import { ApiError } from '../../utils/ApiError';

export interface PublicUser {
  id: string;
  name: string;
  phone: string;
  role: 'Admin' | 'Salesperson' | 'Warehouse';
  status: 'Active' | 'Inactive';
}

function toPublicUser(u: { id: string; name: string; phone: string; role: any; status: any }): PublicUser {
  return { id: u.id, name: u.name, phone: u.phone, role: u.role, status: u.status };
}

// Mirrors the existing frontend login behavior exactly (RoleSelectScreen.tsx
// matchesUser()): match by phone (exact or digits-only substring) OR name
// (case-insensitive substring either direction). The only intentional change
// is that the password check is now bcrypt.compare instead of a plaintext
// string comparison.
export async function login(identifier: string, password: string): Promise<{ token: string; user: PublicUser }> {
  const trimmedIdentifier = identifier.trim();
  const trimmedPassword = password.trim();
  const cleanInputPhone = trimmedIdentifier.replace(/\D/g, '');

  const users = await prisma.user.findMany();
  const match = users.find(u => {
    const isPhoneMatch =
      u.phone === trimmedIdentifier ||
      (cleanInputPhone.length > 0 && u.phone.replace(/\D/g, '').includes(cleanInputPhone));

    const isNameMatch =
      u.name.toLowerCase().includes(trimmedIdentifier.toLowerCase()) ||
      trimmedIdentifier.toLowerCase().includes(u.name.toLowerCase());

    const isPasswordMatch = bcrypt.compareSync(trimmedPassword, u.password_hash);

    return (isPhoneMatch || isNameMatch) && isPasswordMatch;
  });

  if (!match) throw ApiError.unauthorized('Invalid credentials');
  if (match.status === 'Inactive') throw ApiError.forbidden('Your user account has been disabled. Please contact the administrator.');

  const token = signAuthToken({ sub: match.id, role: match.role });
  return { token, user: toPublicUser(match) };
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('User not found');
  return toPublicUser(user);
}
