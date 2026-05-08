import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { UserRole } from '@/types';

/**
 * Role guard middleware — restricts access based on user role
 */
export function roleGuard(request: NextRequest, allowedRoles: UserRole[]) {
  // TODO: Decode JWT and check role
  const userRole = request.cookies.get('user_role')?.value as UserRole | undefined;

  if (!userRole || !allowedRoles.includes(userRole)) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return NextResponse.next();
}
