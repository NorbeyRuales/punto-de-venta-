export type UserRole = 'admin' | 'cashier';

export type AppPermission =
  | 'dashboard:view'
  | 'pos:use'
  | 'cash-register:use'
  | 'inventory:view'
  | 'inventory:manage'
  | 'customers:manage'
  | 'suppliers:manage'
  | 'purchases:register'
  | 'reports:view'
  | 'recharges:manage'
  | 'configuration:view'
  | 'users:manage'
  | 'sync:destructive'
  | 'cash-reports:delete';

const ROLE_PERMISSIONS: Record<UserRole, AppPermission[]> = {
  admin: [
    'dashboard:view',
    'pos:use',
    'cash-register:use',
    'inventory:view',
    'inventory:manage',
    'customers:manage',
    'suppliers:manage',
    'purchases:register',
    'reports:view',
    'recharges:manage',
    'configuration:view',
    'users:manage',
    'sync:destructive',
    'cash-reports:delete',
  ],
  cashier: [
    'dashboard:view',
    'pos:use',
    'cash-register:use',
    'inventory:view',
    'customers:manage',
    'purchases:register',
    'reports:view',
    'recharges:manage',
  ],
};

export const hasPermission = (role: UserRole | null | undefined, permission: AppPermission): boolean => {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
};

export const getDefaultRouteForRole = (role: UserRole | null | undefined): string => {
  if (role === 'cashier') return '/pos';
  return '/dashboard';
};
