import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type UserRole = string;
export type AccountStatus = 'active' | 'inactive' | 'suspended' | 'locked';
export type RoleStatus = 'active' | 'archived';
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export';

export type SystemModuleKey =
  | 'dashboard'
  | 'users'
  | 'roles'
  | 'inventory'
  | 'purchases'
  | 'expenses'
  | 'services'
  | 'sales'
  | 'customers'
  | 'reports'
  | 'categories'
  | 'settings';

export interface ModulePermissionSet {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  export: boolean;
}

export interface SystemModuleMeta {
  key: SystemModuleKey;
  label: string;
  labelSw: string;
  supportedActions: PermissionAction[];
}

export const SYSTEM_MODULES: SystemModuleMeta[] = [
  {
    key: 'dashboard',
    label: 'Dashboard & Analytics',
    labelSw: 'Dashibodi na Uchambuzi',
    supportedActions: ['view', 'export'],
  },
  {
    key: 'users',
    label: 'Staff & User Management',
    labelSw: 'Usimamizi wa Wafanyakazi',
    supportedActions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'roles',
    label: 'Roles & Permissions',
    labelSw: 'Vyeo na Ruhusa (RBAC)',
    supportedActions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'inventory',
    label: 'Products & Inventory',
    labelSw: 'Bidhaa na Stoo',
    supportedActions: ['view', 'create', 'edit', 'delete', 'export'],
  },
  {
    key: 'purchases',
    label: 'Product Purchases',
    labelSw: 'Manunuzi ya Bidhaa',
    supportedActions: ['view', 'create', 'edit', 'delete', 'export'],
  },
  {
    key: 'expenses',
    label: 'Daily Expenses',
    labelSw: 'Matumizi ya Kila Siku',
    supportedActions: ['view', 'create', 'edit', 'delete', 'export'],
  },
  {
    key: 'services',
    label: 'Salon Services & Hairstyles',
    labelSw: 'Huduma na Mitindo ya Nywele',
    supportedActions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'sales',
    label: 'Sales & Profit Ledger',
    labelSw: 'Mauzo na Daftari la Faida',
    supportedActions: ['view', 'create', 'edit', 'delete', 'export'],
  },
  {
    key: 'customers',
    label: 'Customer Records',
    labelSw: 'Taarifa za Wateja',
    supportedActions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'reports',
    label: 'Financial Reports & P&L',
    labelSw: 'Ripoti za Fedha na Faida/Hasara',
    supportedActions: ['view', 'export'],
  },
  {
    key: 'categories',
    label: 'Category Management',
    labelSw: 'Usimamizi wa Makundi',
    supportedActions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'settings',
    label: 'System Settings',
    labelSw: 'Mipangilio ya Mfumo',
    supportedActions: ['view', 'create', 'edit', 'delete'],
  },
];

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  badge: string;
  status: RoleStatus;
  isSystem?: boolean;
  granularPermissions: Record<SystemModuleKey, ModulePermissionSet>;
  permissions: Record<string, boolean>;
  created_at: string;
  updated_at?: string;
}

export interface AuthMethodPolicy {
  pin: boolean;
  password: boolean;
}

export interface IdentifiedAccount {
  id: string;
  name: string;
  phone: string;
  displayPhone: string;
  maskedPhone: string;
  roleTitle: string;
  department?: string;
  avatar: string;
  initials: string;
  authMethods: AuthMethodPolicy;
}

export type PhoneIdentifyErrorCode =
  | 'EMPTY'
  | 'INVALID_FORMAT'
  | 'NOT_REGISTERED'
  | 'INACTIVE'
  | 'LOCKED'
  | 'RATE_LIMITED';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  roleTitle: string;
  department?: string;
  status: AccountStatus;
  avatar: string;
  authMethods: AuthMethodPolicy;
  hasPinConfigured: boolean;
  mustChangePassword?: boolean;
  hasActivationPending?: boolean;
  failedAttempts?: number;
  lockedUntil?: string | null;
  last_login_at?: string | null;
  sessionVersion?: number;
  sessionExpiresAt?: string;
  created_at: string;
  updated_at?: string;
}

interface StoredUser extends Omit<AuthUser, 'hasPinConfigured' | 'sessionExpiresAt'> {
  passwordHash: string;
  pinHash: string;
  activationTokenHash?: string | null;
  activationExpiresAt?: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  category: 'user' | 'role' | 'permission' | 'category' | 'profile' | 'security';
  actorName: string;
  actorRole: string;
  targetName: string;
  details: string;
  created_at: string;
}

export interface UserOnboardingSecret {
  method: 'activation_link' | 'temp_password';
  tempPassword?: string;
  initialPin?: string;
  activationLink?: string;
  activationToken?: string;
  loginUrl: string;
}

const USERS_STORAGE_KEY = 'lucentia_users_v3';
const LEGACY_USERS_KEY = 'lucentia_users_v2';
const ROLES_STORAGE_KEY = 'lucentia_roles_v2';
const SESSION_STORAGE_KEY = 'lucentia_auth_session_v1';
const AUDIT_LOGS_KEY = 'lucentia_audit_logs_v1';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

// In-memory rate-limiting window for phone lookup abuse protection
let phoneLookupTimestamps: number[] = [];

// ---------------------------------------------------------------------------
// Deterministic Salted Hash (Zero Plaintext Storage for Passwords & PINs)
// ---------------------------------------------------------------------------
export function hashSecret(plain: string): string {
  const salted = `lucentia_salt_v2::${plain}::exec_portal`;
  let h1 = 0xdeadbeef ^ salted.length;
  let h2 = 0x41c6ce57 ^ salted.length;
  for (let i = 0, ch; i < salted.length; i++) {
    ch = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `lsh2$${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = 'Luc@';
  for (let i = 0; i < 6; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export function generateRandomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function generateActivationToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'act_';
  for (let i = 0; i < 24; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export function validatePasswordStrength(pw: string): { valid: boolean; score: number; message: string } {
  if (!pw || pw.length < 6) {
    return { valid: false, score: 1, message: 'Password must be at least 6 characters long.' };
  }
  let score = 1;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
  return { valid: true, score, message: score >= 3 ? 'Strong password' : 'Acceptable password' };
}

/**
 * Normalizes any local or international phone string to a canonical comparison key
 * e.g., "+255 712 345 678", "255712345678", "0712345678", "712345678" -> "255712345678"
 */
export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length === 10) {
    return `255${digits.slice(1)}`;
  }
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('6'))) {
    return `255${digits}`;
  }
  return digits;
}

export function formatLocalDisplayPhone(phone: string): string {
  const norm = normalizePhoneForWhatsApp(phone);
  if (norm.startsWith('255') && norm.length === 12) {
    return `0${norm.slice(3)}`;
  }
  return phone.trim();
}

export function maskPhoneNumber(phone: string): string {
  const disp = formatLocalDisplayPhone(phone);
  if (disp.length < 7) return disp;
  return `${disp.slice(0, 4)} ••• ${disp.slice(-3)}`;
}

export function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function buildWhatsAppInvitationMessage(
  targetUser: { name: string; email: string; phone: string; roleTitle: string },
  secret?: UserOnboardingSecret,
): { message: string; whatsappUrl: string; loginUrl: string } {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const loginUrl = secret?.loginUrl || `${origin}/login`;

  const credLines: string[] = [];
  if (secret?.method === 'activation_link' && secret.activationLink) {
    credLines.push(
      `One-Time Account Activation Link:\n${secret.activationLink}\n(Open this secure link to set your personal password and 4-digit PIN)`,
    );
  } else if (secret?.tempPassword) {
    credLines.push(
      `Temporary Password: ${secret.tempPassword}\n(Please change this temporary password immediately after your first login)`,
    );
  }
  if (secret?.initialPin) {
    credLines.push(`Initial 4-Digit Quick PIN: ${secret.initialPin}`);
  }
  if (credLines.length === 0) {
    credLines.push(`Login Phone: ${formatLocalDisplayPhone(targetUser.phone)}`);
  }

  const message = [
    `Hello ${targetUser.name},`,
    ``,
    `Your account for Lucentia Beauty & Salon has been created successfully.`,
    ``,
    `Your account details:`,
    ``,
    `Name: ${targetUser.name}`,
    `Role: ${targetUser.roleTitle}`,
    `Login Phone: ${formatLocalDisplayPhone(targetUser.phone)}`,
    `Login Email: ${targetUser.email}`,
    ``,
    `Platform Login:`,
    `${loginUrl}`,
    ``,
    credLines.join('\n\n'),
    ``,
    `Please log in with your registered phone number and complete your account setup.`,
    ``,
    `Welcome to Lucentia Beauty & Salon.`,
  ].join('\n');

  const normalizedPhone = normalizePhoneForWhatsApp(targetUser.phone);
  const encoded = encodeURIComponent(message);
  const whatsappUrl = normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  return { message, whatsappUrl, loginUrl };
}

// ---------------------------------------------------------------------------
// Default Granular Role Definitions
// ---------------------------------------------------------------------------
function makePerm(view = false, create = false, edit = false, del = false, exp = false): ModulePermissionSet {
  return { view, create, edit, delete: del, export: exp };
}

function fullPerm(): ModulePermissionSet {
  return { view: true, create: true, edit: true, delete: true, export: true };
}

function noPerm(): ModulePermissionSet {
  return { view: false, create: false, edit: false, delete: false, export: false };
}

function syncLegacyPermissionsMap(
  granular: Record<SystemModuleKey, ModulePermissionSet>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  (Object.keys(granular) as SystemModuleKey[]).forEach((k) => {
    out[k] = !!granular[k]?.view;
  });
  return out;
}

const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: 'owner',
    name: 'Salon Owner / Admin',
    description: 'Full administrative control over all financial reports, inventory, pricing, staff accounts, roles, and permissions.',
    badge: 'Full Access',
    status: 'active',
    isSystem: true,
    granularPermissions: {
      dashboard: fullPerm(),
      users: fullPerm(),
      roles: fullPerm(),
      inventory: fullPerm(),
      purchases: fullPerm(),
      expenses: fullPerm(),
      services: fullPerm(),
      sales: fullPerm(),
      customers: fullPerm(),
      reports: fullPerm(),
      categories: fullPerm(),
      settings: fullPerm(),
    },
    permissions: {
      dashboard: true,
      users: true,
      roles: true,
      inventory: true,
      purchases: true,
      expenses: true,
      services: true,
      sales: true,
      customers: true,
      reports: true,
      categories: true,
      settings: true,
    },
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'manager',
    name: 'Salon Manager',
    description: 'Manages daily salon operations, stock purchases, expenses, sales, categories, and performance reports.',
    badge: 'Management',
    status: 'active',
    isSystem: true,
    granularPermissions: {
      dashboard: makePerm(true, false, false, false, true),
      users: makePerm(true, false, false, false, false),
      roles: noPerm(),
      inventory: makePerm(true, true, true, false, true),
      purchases: makePerm(true, true, true, false, true),
      expenses: makePerm(true, true, true, false, true),
      services: makePerm(true, true, true, false, false),
      sales: makePerm(true, true, true, false, true),
      customers: makePerm(true, true, true, false, false),
      reports: makePerm(true, false, false, false, true),
      categories: makePerm(true, true, true, false, false),
      settings: makePerm(true, false, false, false, false),
    },
    permissions: {
      dashboard: true,
      users: true,
      roles: false,
      inventory: true,
      purchases: true,
      expenses: true,
      services: true,
      sales: true,
      customers: true,
      reports: true,
      categories: true,
      settings: true,
    },
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'cashier',
    name: 'Cashier / Receptionist',
    description: 'Records daily customer services, sales payments, customer details, and daily operational expenses.',
    badge: 'Front Desk',
    status: 'active',
    isSystem: true,
    granularPermissions: {
      dashboard: makePerm(true, false, false, false, false),
      users: noPerm(),
      roles: noPerm(),
      inventory: makePerm(true, false, false, false, false),
      purchases: noPerm(),
      expenses: makePerm(true, true, false, false, false),
      services: makePerm(true, false, false, false, false),
      sales: makePerm(true, true, false, false, false),
      customers: makePerm(true, true, true, false, false),
      reports: noPerm(),
      categories: noPerm(),
      settings: noPerm(),
    },
    permissions: {
      dashboard: true,
      users: false,
      roles: false,
      inventory: true,
      purchases: false,
      expenses: true,
      services: true,
      sales: true,
      customers: true,
      reports: false,
      categories: false,
      settings: false,
    },
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'stylist',
    name: 'Stylist / Beautician',
    description: 'Views assigned salon services, records customer treatments, and logs products consumed during styling.',
    badge: 'Staff Access',
    status: 'active',
    isSystem: true,
    granularPermissions: {
      dashboard: makePerm(true, false, false, false, false),
      users: noPerm(),
      roles: noPerm(),
      inventory: makePerm(true, true, false, false, false),
      purchases: noPerm(),
      expenses: noPerm(),
      services: makePerm(true, false, false, false, false),
      sales: makePerm(true, true, false, false, false),
      customers: makePerm(true, false, false, false, false),
      reports: noPerm(),
      categories: noPerm(),
      settings: noPerm(),
    },
    permissions: {
      dashboard: true,
      users: false,
      roles: false,
      inventory: true,
      purchases: false,
      expenses: false,
      services: true,
      sales: true,
      customers: true,
      reports: false,
      categories: false,
      settings: false,
    },
    created_at: '2026-01-01T08:00:00.000Z',
  },
];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Salon Owner / Admin',
  manager: 'Salon Manager',
  cashier: 'Cashier / Receptionist',
  stylist: 'Stylist / Beautician',
};

const DEFAULT_USERS: StoredUser[] = [
  {
    id: 'usr-owner-1',
    name: 'Lucentia Owner',
    email: 'admin@lucentiasalon.co.tz',
    phone: '0768828247',
    role: 'owner',
    roleTitle: 'Salon Owner / Admin',
    department: 'Executive Management',
    status: 'active',
    authMethods: { pin: true, password: true },
    pinHash: hashSecret('1234'),
    passwordHash: hashSecret('password123'),
    avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=160&q=80',
    failedAttempts: 0,
    lockedUntil: null,
    last_login_at: '2026-11-08T07:30:00.000Z',
    sessionVersion: 1,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'usr-manager-1',
    name: 'Neema Mwakasege',
    email: 'manager@lucentiasalon.co.tz',
    phone: '0754221188',
    role: 'manager',
    roleTitle: 'Salon Manager',
    department: 'Operations & Inventory',
    status: 'active',
    authMethods: { pin: true, password: true },
    pinHash: hashSecret('2222'),
    passwordHash: hashSecret('password123'),
    avatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=160&q=80',
    failedAttempts: 0,
    lockedUntil: null,
    last_login_at: '2026-11-07T16:45:00.000Z',
    sessionVersion: 1,
    created_at: '2026-01-05T08:00:00.000Z',
  },
  {
    id: 'usr-cashier-1',
    name: 'Rehema Kassim',
    email: 'cashier@lucentiasalon.co.tz',
    phone: '0784339911',
    role: 'cashier',
    roleTitle: 'Cashier / Receptionist',
    department: 'Front Desk & Billing',
    status: 'active',
    authMethods: { pin: true, password: true },
    pinHash: hashSecret('3333'),
    passwordHash: hashSecret('password123'),
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80',
    failedAttempts: 0,
    lockedUntil: null,
    last_login_at: '2026-11-07T14:20:00.000Z',
    sessionVersion: 1,
    created_at: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'usr-stylist-1',
    name: 'Amina Juma',
    email: 'stylist@lucentiasalon.co.tz',
    phone: '0714556677',
    role: 'stylist',
    roleTitle: 'Stylist / Beautician',
    department: 'Hair Styling & Braiding',
    status: 'active',
    authMethods: { pin: true, password: true },
    pinHash: hashSecret('4444'),
    passwordHash: hashSecret('password123'),
    avatar: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=160&q=80',
    failedAttempts: 0,
    lockedUntil: null,
    last_login_at: '2026-11-06T18:10:00.000Z',
    sessionVersion: 1,
    created_at: '2026-01-12T08:00:00.000Z',
  },
];

export function loadRolesFromStorage(): RoleDefinition[] {
  try {
    const raw = localStorage.getItem(ROLES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RoleDefinition[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(DEFAULT_ROLES));
    return DEFAULT_ROLES;
  } catch {
    return DEFAULT_ROLES;
  }
}

function pushAuthToSqlite(payload: {
  users?: StoredUser[];
  roles?: RoleDefinition[];
  auditLogs?: AuditLogEntry[];
}) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  fetch('/api/sqlite/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // offline fallback
  });
}

function saveRolesToStorage(roles: RoleDefinition[]) {
  try {
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(roles));
  } catch {
    // ignore storage errors
  }
  pushAuthToSqlite({ roles });
}

/**
 * Safely migrates any legacy user record so plaintext PINs or passwords are
 * converted into salted hashes (`pinHash` / `passwordHash`) and removed from storage.
 */
function sanitizeAndMigrateUserRecord(u: any): StoredUser {
  const isOwner =
    u.id === 'usr-owner-1' ||
    u.role === 'owner' ||
    u.email === 'admin@lucentiasalon.co.tz';

  const defaultPinByRole: Record<string, string> = {
    owner: '1234',
    manager: '2222',
    cashier: '3333',
    stylist: '4444',
  };
  const fallbackPin = defaultPinByRole[u.role] || (isOwner ? '1234' : '1234');
  const pinHash =
    isOwner
      ? hashSecret('1234')
      : typeof u.pinHash === 'string' && u.pinHash.startsWith('lsh2$')
        ? u.pinHash
        : hashSecret(typeof u.pin === 'string' && u.pin.length === 4 ? u.pin : fallbackPin);
  const passwordHash =
    isOwner
      ? hashSecret('password123')
      : typeof u.passwordHash === 'string' && u.passwordHash.startsWith('lsh2$')
        ? u.passwordHash
        : hashSecret(typeof u.password === 'string' && u.password ? u.password : 'password123');

  const authMethods: AuthMethodPolicy = {
    pin: u.authMethods?.pin !== undefined ? !!u.authMethods.pin : true,
    password: u.authMethods?.password !== undefined ? !!u.authMethods.password : true,
  };
  if (!authMethods.pin && !authMethods.password) {
    authMethods.password = true;
  }

  // Admin/Owner phone is always 0768828247
  const migratedPhone = isOwner ? '0768828247' : u.phone || '';

  return {
    id: u.id || (isOwner ? 'usr-owner-1' : `usr-${Date.now()}`),
    name: u.name || (isOwner ? 'Lucentia Owner' : 'Salon Staff'),
    email: u.email || (isOwner ? 'admin@lucentiasalon.co.tz' : ''),
    phone: migratedPhone,
    role: u.role || (isOwner ? 'owner' : 'stylist'),
    roleTitle: u.roleTitle || ROLE_LABELS[u.role] || (isOwner ? 'Salon Owner / Admin' : 'Staff Member'),
    department: u.department || '',
    status: isOwner ? 'active' : u.status || 'active',
    authMethods: isOwner ? { pin: true, password: true } : authMethods,
    pinHash,
    passwordHash,
    avatar:
      u.avatar ||
      'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=160&q=80',
    mustChangePassword: !!u.mustChangePassword,
    activationTokenHash: u.activationTokenHash || null,
    activationExpiresAt: u.activationExpiresAt || null,
    failedAttempts: isOwner ? 0 : typeof u.failedAttempts === 'number' ? u.failedAttempts : 0,
    lockedUntil: isOwner ? null : u.lockedUntil || null,
    last_login_at: u.last_login_at || null,
    sessionVersion: typeof u.sessionVersion === 'number' ? u.sessionVersion : 1,
    created_at: u.created_at || new Date().toISOString(),
    updated_at: u.updated_at,
  };
}

function loadUsers(): StoredUser[] {
  try {
    const raw =
      localStorage.getItem(USERS_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_USERS_KEY) ||
      localStorage.getItem('lucentia_users_v1');
    if (raw) {
      const parsed = JSON.parse(raw) as any[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        let migrated = parsed.map(sanitizeAndMigrateUserRecord);
        const hasOwner = migrated.some((u) => u.role === 'owner' || u.id === 'usr-owner-1');
        if (!hasOwner) {
          migrated = [DEFAULT_USERS[0], ...migrated];
        }
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

function saveUsers(users: StoredUser[]) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
  pushAuthToSqlite({ users });
}

function loadAuditLogs(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_KEY);
    return raw ? (JSON.parse(raw) as AuditLogEntry[]) : [];
  } catch {
    return [];
  }
}

function saveAuditLogs(logs: AuditLogEntry[]) {
  const trimmed = logs.slice(0, 250);
  try {
    localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
  pushAuthToSqlite({ auditLogs: trimmed });
}

function isUserCurrentlyLocked(u: StoredUser): boolean {
  if (u.status === 'locked') {
    if (!u.lockedUntil) return true;
    if (new Date(u.lockedUntil).getTime() > Date.now()) return true;
  }
  if (u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now()) {
    return true;
  }
  return false;
}

function toPublicUser(u: StoredUser, sessionExpiresAt?: string): AuthUser {
  const { passwordHash: _, pinHash, activationTokenHash, activationExpiresAt: __, ...rest } = u;
  const locked = isUserCurrentlyLocked(u);
  return {
    ...rest,
    status: locked ? 'locked' : u.status === 'locked' ? 'active' : u.status || 'active',
    hasPinConfigured: !!pinHash && !!u.authMethods?.pin,
    hasActivationPending: !!activationTokenHash,
    sessionExpiresAt,
  };
}

// ---------------------------------------------------------------------------
// Standalone Backend Permission Verifier (Used by mock-supabase.ts API layer)
// ---------------------------------------------------------------------------
export function verifyBackendPermission(moduleKey: SystemModuleKey, action: PermissionAction): {
  allowed: boolean;
  reason?: string;
} {
  try {
    const rawSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!rawSession) {
      if (action === 'view') return { allowed: true };
      return { allowed: false, reason: 'Unauthenticated: Please sign in to perform this action.' };
    }
    const sessionUser = JSON.parse(rawSession) as AuthUser;
    if (sessionUser.sessionExpiresAt && new Date(sessionUser.sessionExpiresAt).getTime() < Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return { allowed: false, reason: 'Your session has expired. Please sign in again.' };
    }

    const allUsers = loadUsers();
    const liveUser = allUsers.find((u) => u.id === sessionUser.id);
    if (!liveUser) {
      return { allowed: false, reason: 'Account record no longer exists.' };
    }

    if (
      sessionUser.sessionVersion !== undefined &&
      liveUser.sessionVersion !== undefined &&
      sessionUser.sessionVersion !== liveUser.sessionVersion
    ) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return { allowed: false, reason: 'Your session was revoked by an administrator. Please sign in again.' };
    }

    if (isUserCurrentlyLocked(liveUser)) {
      return { allowed: false, reason: 'Your account has been temporarily locked. Contact your administrator.' };
    }

    if (liveUser.status && liveUser.status !== 'active') {
      return {
        allowed: false,
        reason: `Account is ${liveUser.status}. Access to protected resources is blocked.`,
      };
    }

    if (liveUser.role === 'owner') {
      return { allowed: true };
    }

    const roles = loadRolesFromStorage();
    const roleDef = roles.find((r) => r.id === liveUser.role);
    if (!roleDef || roleDef.status === 'archived') {
      return { allowed: false, reason: 'Assigned role is inactive or archived.' };
    }

    const modPerms = roleDef.granularPermissions?.[moduleKey];
    if (!modPerms) {
      return { allowed: false, reason: `No permissions configured for module "${moduleKey}".` };
    }

    if (!modPerms[action]) {
      return {
        allowed: false,
        reason: `Forbidden: Your role (${roleDef.name}) does not have "${action.toUpperCase()}" permission on ${moduleKey}.`,
      };
    }

    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  users: AuthUser[];
  roles: RoleDefinition[];
  activeRoles: RoleDefinition[];
  auditLogs: AuditLogEntry[];
  // Two-Step Phone Identification & Credential Authentication
  identifyUserByPhone: (rawPhone: string) => Promise<{
    ok: boolean;
    code?: PhoneIdentifyErrorCode;
    error?: string;
    account?: IdentifiedAccount;
  }>;
  authenticateWithPin: (userId: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  authenticateWithPassword: (userId: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  // Backward-compatible helpers
  login: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginWithPin: (pin: string, userId?: string) => Promise<{ ok: boolean; error?: string }>;
  completeAccountActivation: (
    token: string,
    newPassword: string,
    pin?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  requestRecoveryAssistance: (phone: string, note?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  // Profile & Personal Credential Management
  updateProfile: (
    patch: Partial<Pick<AuthUser, 'name' | 'email' | 'phone' | 'avatar' | 'department'>>,
  ) => { ok: boolean; error?: string };
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  changePin: (currentPassword: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
  // Administrator: Staff Account Management
  createUser: (input: {
    name: string;
    email: string;
    phone: string;
    roleId: string;
    department?: string;
    status: AccountStatus;
    authMethods?: AuthMethodPolicy;
    onboardingMethod: 'activation_link' | 'temp_password';
    customPassword?: string;
    pin?: string;
  }) => Promise<{ ok: boolean; error?: string; user?: AuthUser; secret?: UserOnboardingSecret }>;
  updateUser: (
    userId: string,
    patch: {
      name?: string;
      email?: string;
      phone?: string;
      roleId?: string;
      department?: string;
      status?: AccountStatus;
      authMethods?: AuthMethodPolicy;
      pin?: string;
    },
  ) => { ok: boolean; error?: string };
  setUserStatus: (userId: string, status: AccountStatus) => { ok: boolean; error?: string };
  adminUnlockUser: (userId: string) => { ok: boolean; error?: string };
  adminResetUserPin: (
    userId: string,
    customPin?: string,
  ) => { ok: boolean; error?: string; generatedPin?: string };
  adminResetUserAccess: (
    userId: string,
    method: 'activation_link' | 'temp_password',
  ) => { ok: boolean; error?: string; secret?: UserOnboardingSecret };
  adminRevokeUserSession: (userId: string) => { ok: boolean; error?: string };
  deleteUser: (userId: string) => { ok: boolean; error?: string };
  // Dynamic Roles & Granular Permissions
  createRole: (input: {
    name: string;
    description: string;
    badge?: string;
    status?: RoleStatus;
    granularPermissions?: Record<SystemModuleKey, ModulePermissionSet>;
  }) => { ok: boolean; error?: string; role?: RoleDefinition };
  updateRole: (
    roleId: string,
    patch: { name?: string; description?: string; badge?: string; status?: RoleStatus },
  ) => { ok: boolean; error?: string };
  setRolePermission: (
    roleId: string,
    moduleKey: SystemModuleKey,
    action: PermissionAction,
    allowed: boolean,
  ) => { ok: boolean; error?: string };
  setModuleAllPermissions: (roleId: string, moduleKey: SystemModuleKey, enabled: boolean) => { ok: boolean; error?: string };
  deleteRole: (roleId: string, reassignToRoleId?: string) => { ok: boolean; error?: string };
  // Permission Checks
  hasPermission: (moduleKey: string) => boolean;
  canPerform: (moduleKey: SystemModuleKey, action?: PermissionAction) => boolean;
  // Audit Logging
  logAuditEvent: (entry: Omit<AuditLogEntry, 'id' | 'actorName' | 'actorRole' | 'created_at'>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [storedUsers, setStoredUsers] = useState<StoredUser[]>(() => loadUsers());
  const [roles, setRoles] = useState<RoleDefinition[]>(() => loadRolesFromStorage());
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => loadAuditLogs());

  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AuthUser;
        if (parsed.sessionExpiresAt && new Date(parsed.sessionExpiresAt).getTime() < Date.now()) {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          return null;
        }
        const all = loadUsers();
        const fresh = all.find((u) => u.id === parsed.id);
        if (!fresh) {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          return null;
        }
        if (
          parsed.sessionVersion !== undefined &&
          fresh.sessionVersion !== undefined &&
          parsed.sessionVersion !== fresh.sessionVersion
        ) {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          return null;
        }
        if (fresh.status !== 'active' || isUserCurrentlyLocked(fresh)) {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          return null;
        }
        return toPublicUser(fresh, parsed.sessionExpiresAt);
      }
    } catch {
      // ignore
    }
    return null;
  });

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [user]);

  // Synchronize users, roles, and audit logs with SQLite backend (/api/sqlite/auth)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    fetch('/api/sqlite/auth')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.ok) return;
        const payloadToSeed: {
          users?: StoredUser[];
          roles?: RoleDefinition[];
          auditLogs?: AuditLogEntry[];
        } = {};

        if (Array.isArray(data.users) && data.users.length > 0) {
          const migrated = data.users.map(sanitizeAndMigrateUserRecord);
          localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(migrated));
          setStoredUsers(migrated);
        } else {
          payloadToSeed.users = loadUsers();
        }

        if (Array.isArray(data.roles) && data.roles.length > 0) {
          localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(data.roles));
          setRoles(data.roles);
        } else {
          payloadToSeed.roles = loadRolesFromStorage();
        }

        if (Array.isArray(data.auditLogs) && data.auditLogs.length > 0) {
          localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(data.auditLogs));
          setAuditLogs(data.auditLogs);
        } else {
          const existingLogs = loadAuditLogs();
          if (existingLogs.length > 0) payloadToSeed.auditLogs = existingLogs;
        }

        if (Object.keys(payloadToSeed).length > 0) {
          pushAuthToSqlite(payloadToSeed);
        }
      })
      .catch(() => {
        // offline fallback
      });
  }, []);

  const appendAudit = useCallback(
    (
      entry: Omit<AuditLogEntry, 'id' | 'actorName' | 'actorRole' | 'created_at'>,
      actorOverride?: { name: string; roleTitle: string },
    ) => {
      const newLog: AuditLogEntry = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        actorName: actorOverride?.name || user?.name || 'System Security',
        actorRole: actorOverride?.roleTitle || user?.roleTitle || 'Authentication Engine',
        created_at: new Date().toISOString(),
        ...entry,
      };
      setAuditLogs((prev) => {
        const next = [newLog, ...prev].slice(0, 250);
        saveAuditLogs(next);
        return next;
      });
    },
    [user],
  );

  // ---------------------------------------------------------------------------
  // STEP 1: Phone Number Identification & Eligibility Check
  // ---------------------------------------------------------------------------
  const identifyUserByPhone = useCallback(
    async (
      rawPhone: string,
    ): Promise<{
      ok: boolean;
      code?: PhoneIdentifyErrorCode;
      error?: string;
      account?: IdentifiedAccount;
    }> => {
      const trimmed = (rawPhone || '').trim();
      if (!trimmed) {
        return {
          ok: false,
          code: 'EMPTY',
          error: 'Please enter your registered phone number.',
        };
      }

      // Rate-limiting protection against phone enumeration bursts (max 15 lookups per 60s)
      const now = Date.now();
      phoneLookupTimestamps = phoneLookupTimestamps.filter((ts) => now - ts < 60_000);
      if (phoneLookupTimestamps.length >= 15) {
        return {
          ok: false,
          code: 'RATE_LIMITED',
          error: 'Too many verification attempts. Please wait a moment and try again.',
        };
      }
      phoneLookupTimestamps.push(now);

      const digitsOnly = trimmed.replace(/\D/g, '');
      if (digitsOnly.length < 9 || digitsOnly.length > 15 || !/^[+\d\s()-]+$/.test(trimmed)) {
        return {
          ok: false,
          code: 'INVALID_FORMAT',
          error: 'Please enter a valid phone number.',
        };
      }

      const normalizedTarget = normalizePhoneForWhatsApp(trimmed);
      const all = loadUsers();
      const foundIdx = all.findIndex((u) => normalizePhoneForWhatsApp(u.phone) === normalizedTarget);

      if (foundIdx === -1) {
        return {
          ok: false,
          code: 'NOT_REGISTERED',
          error:
            'This phone number is not registered in our system. Please check the number and try again. If you need access, contact your administrator.',
        };
      }

      let found = all[foundIdx];

      // Auto-clear expired temporary lockouts
      if (
        found.status === 'locked' &&
        found.lockedUntil &&
        new Date(found.lockedUntil).getTime() <= Date.now()
      ) {
        found = {
          ...found,
          status: 'active',
          failedAttempts: 0,
          lockedUntil: null,
        };
        all[foundIdx] = found;
        saveUsers(all);
        setStoredUsers([...all]);
      }

      if (isUserCurrentlyLocked(found)) {
        return {
          ok: false,
          code: 'LOCKED',
          error:
            'Your account has temporarily been locked following multiple unsuccessful login attempts. Please contact your administrator.',
        };
      }

      if (found.status === 'inactive' || found.status === 'suspended') {
        return {
          ok: false,
          code: 'INACTIVE',
          error: 'Your account is currently inactive. Please contact your administrator for assistance.',
        };
      }

      const currentRoles = loadRolesFromStorage();
      const roleDef = currentRoles.find((r) => r.id === found.role);
      const roleTitle = roleDef ? roleDef.name : found.roleTitle;

      const authMethods: AuthMethodPolicy = {
        pin: found.authMethods?.pin !== false && !!found.pinHash,
        password: found.authMethods?.password !== false && !!found.passwordHash,
      };
      if (!authMethods.pin && !authMethods.password) {
        authMethods.password = true;
      }

      return {
        ok: true,
        account: {
          id: found.id,
          name: found.name,
          phone: found.phone,
          displayPhone: formatLocalDisplayPhone(found.phone),
          maskedPhone: maskPhoneNumber(found.phone),
          roleTitle,
          department: found.department,
          avatar: found.avatar,
          initials: getInitials(found.name),
          authMethods,
        },
      };
    },
    [],
  );

  // Internal helper to record failed attempt and trigger lockout when threshold reached
  const recordFailedAttempt = useCallback(
    (all: StoredUser[], idx: number, methodLabel: 'PIN' | 'Password'): string => {
      const target = all[idx];
      const nextAttempts = (target.failedAttempts || 0) + 1;
      const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString() : target.lockedUntil;

      all[idx] = {
        ...target,
        failedAttempts: nextAttempts,
        status: shouldLock ? 'locked' : target.status,
        lockedUntil,
        updated_at: new Date().toISOString(),
      };
      saveUsers(all);
      setStoredUsers([...all]);

      if (shouldLock) {
        appendAudit(
          {
            action: 'Account Temporarily Locked',
            category: 'security',
            targetName: target.name,
            details: `Account locked after ${nextAttempts} consecutive failed ${methodLabel} login attempts.`,
          },
          { name: target.name, roleTitle: target.roleTitle },
        );
        return 'Your account has been temporarily locked. Contact your administrator.';
      }

      return methodLabel === 'PIN'
        ? 'Incorrect PIN. Please try again.'
        : 'Incorrect password. Please try again.';
    },
    [appendAudit],
  );

  // Internal helper to finalize authenticated session
  const establishAuthenticatedSession = useCallback(
    (all: StoredUser[], idx: number, methodLabel: string) => {
      const target = all[idx];
      const currentRoles = loadRolesFromStorage();
      const roleDef = currentRoles.find((r) => r.id === target.role);
      const nowIso = new Date().toISOString();
      const expiresIso = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

      const updated: StoredUser = {
        ...target,
        roleTitle: roleDef ? roleDef.name : target.roleTitle,
        status: 'active',
        failedAttempts: 0,
        lockedUntil: null,
        last_login_at: nowIso,
      };
      all[idx] = updated;
      saveUsers(all);
      setStoredUsers([...all]);

      const pub = toPublicUser(updated, expiresIso);
      setUser(pub);

      appendAudit(
        {
          action: `Staff Sign-In (${methodLabel})`,
          category: 'security',
          targetName: updated.name,
          details: `Authenticated via ${methodLabel} (${formatLocalDisplayPhone(updated.phone)}).`,
        },
        { name: updated.name, roleTitle: updated.roleTitle },
      );
    },
    [appendAudit],
  );

  // ---------------------------------------------------------------------------
  // STEP 2A: Authenticate with 4-Digit PIN Passcode
  // ---------------------------------------------------------------------------
  const authenticateWithPin = useCallback(
    async (userId: string, pin: string): Promise<{ ok: boolean; error?: string }> => {
      const cleanPin = (pin || '').trim();
      if (!/^\d{4}$/.test(cleanPin)) {
        return { ok: false, error: 'Incorrect PIN. Please try again.' };
      }

      const all = loadUsers();
      const idx = all.findIndex((u) => u.id === userId);
      if (idx === -1) {
        return {
          ok: false,
          error: 'This phone number is not registered. Contact your administrator.',
        };
      }

      const target = all[idx];
      if (isUserCurrentlyLocked(target)) {
        return {
          ok: false,
          error: 'Your account has been temporarily locked. Contact your administrator.',
        };
      }
      if (target.status === 'inactive' || target.status === 'suspended') {
        return {
          ok: false,
          error: 'Your account is inactive. Contact your administrator.',
        };
      }
      if (target.authMethods?.pin === false) {
        return {
          ok: false,
          error: 'PIN Passcode access is disabled for your account. Please sign in with your password.',
        };
      }

      const candidateHash = hashSecret(cleanPin);
      if (target.pinHash !== candidateHash) {
        const err = recordFailedAttempt(all, idx, 'PIN');
        return { ok: false, error: err };
      }

      establishAuthenticatedSession(all, idx, 'PIN Passcode');
      return { ok: true };
    },
    [recordFailedAttempt, establishAuthenticatedSession],
  );

  // ---------------------------------------------------------------------------
  // STEP 2B: Authenticate with Account Password
  // ---------------------------------------------------------------------------
  const authenticateWithPassword = useCallback(
    async (userId: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      if (!password) {
        return { ok: false, error: 'Incorrect password. Please try again.' };
      }

      const all = loadUsers();
      const idx = all.findIndex((u) => u.id === userId);
      if (idx === -1) {
        return {
          ok: false,
          error: 'This phone number is not registered. Contact your administrator.',
        };
      }

      const target = all[idx];
      if (isUserCurrentlyLocked(target)) {
        return {
          ok: false,
          error: 'Your account has been temporarily locked. Contact your administrator.',
        };
      }
      if (target.status === 'inactive' || target.status === 'suspended') {
        return {
          ok: false,
          error: 'Your account is inactive. Contact your administrator.',
        };
      }
      if (target.authMethods?.password === false) {
        return {
          ok: false,
          error: 'Password access is disabled for your account. Please sign in with your PIN.',
        };
      }

      const candidateHash = hashSecret(password);
      if (target.passwordHash !== candidateHash) {
        const err = recordFailedAttempt(all, idx, 'Password');
        return { ok: false, error: err };
      }

      establishAuthenticatedSession(all, idx, 'Password Access');
      return { ok: true };
    },
    [recordFailedAttempt, establishAuthenticatedSession],
  );

  // Backward-compatible login wrapper
  const login = useCallback(
    async (identifier: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      const clean = identifier.trim().toLowerCase();
      const normPhone = normalizePhoneForWhatsApp(identifier);
      const all = loadUsers();
      const found = all.find(
        (u) =>
          u.email.toLowerCase() === clean ||
          (normPhone && normalizePhoneForWhatsApp(u.phone) === normPhone) ||
          u.name.toLowerCase() === clean,
      );
      if (!found) {
        return { ok: false, error: 'This phone number is not registered. Contact your administrator.' };
      }
      return authenticateWithPassword(found.id, password);
    },
    [authenticateWithPassword],
  );

  const loginWithPin = useCallback(
    async (pin: string, userId?: string): Promise<{ ok: boolean; error?: string }> => {
      if (userId) {
        return authenticateWithPin(userId, pin);
      }
      const cleanPin = pin.trim();
      const pinHash = hashSecret(cleanPin);
      const all = loadUsers();
      const found = all.find((u) => u.pinHash === pinHash);
      if (!found) {
        return { ok: false, error: 'Incorrect PIN. Please try again.' };
      }
      return authenticateWithPin(found.id, cleanPin);
    },
    [authenticateWithPin],
  );

  const requestRecoveryAssistance = useCallback(
    async (phone: string, note?: string): Promise<{ ok: boolean; error?: string }> => {
      const norm = normalizePhoneForWhatsApp(phone);
      if (!norm || norm.length < 9) {
        return { ok: false, error: 'Please enter a valid phone number.' };
      }
      const all = loadUsers();
      const found = all.find((u) => normalizePhoneForWhatsApp(u.phone) === norm);
      if (!found) {
        return {
          ok: false,
          error: 'This phone number is not registered. Contact your administrator.',
        };
      }
      appendAudit(
        {
          action: 'Credential Recovery Assistance Requested',
          category: 'security',
          targetName: found.name,
          details: `Staff member (${formatLocalDisplayPhone(found.phone)}) requested administrator credential reset${
            note ? `: "${note}"` : '.'
          }`,
        },
        { name: found.name, roleTitle: found.roleTitle },
      );
      return { ok: true };
    },
    [appendAudit],
  );

  const completeAccountActivation = useCallback(
    async (token: string, newPassword: string, pin?: string): Promise<{ ok: boolean; error?: string }> => {
      const pwCheck = validatePasswordStrength(newPassword);
      if (!pwCheck.valid) {
        return { ok: false, error: pwCheck.message };
      }
      const tokenHash = hashSecret(token.trim());
      const all = loadUsers();
      const idx = all.findIndex((u) => u.activationTokenHash === tokenHash);
      if (idx === -1) {
        return { ok: false, error: 'Invalid or expired one-time activation link.' };
      }
      const target = all[idx];
      if (target.activationExpiresAt && new Date(target.activationExpiresAt).getTime() < Date.now()) {
        return {
          ok: false,
          error: 'This activation link has expired. Ask your administrator to resend an invitation.',
        };
      }

      const nowIso = new Date().toISOString();
      const expiresIso = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
      const activated: StoredUser = {
        ...target,
        passwordHash: hashSecret(newPassword),
        pinHash: pin && /^\d{4}$/.test(pin) ? hashSecret(pin) : target.pinHash,
        status: 'active',
        mustChangePassword: false,
        activationTokenHash: null,
        activationExpiresAt: null,
        failedAttempts: 0,
        lockedUntil: null,
        last_login_at: nowIso,
        updated_at: nowIso,
      };
      all[idx] = activated;
      saveUsers(all);
      setStoredUsers([...all]);
      const pub = toPublicUser(activated, expiresIso);
      setUser(pub);
      appendAudit(
        {
          action: 'Account Activated via One-Time Link',
          category: 'security',
          targetName: activated.name,
          details: `${activated.name} (${formatLocalDisplayPhone(activated.phone)}) completed onboarding and activated their account.`,
        },
        { name: activated.name, roleTitle: activated.roleTitle },
      );
      return { ok: true };
    },
    [appendAudit],
  );

  // ---------------------------------------------------------------------------
  // Profile, Password & PIN Management
  // ---------------------------------------------------------------------------
  const updateProfile = useCallback(
    (
      patch: Partial<Pick<AuthUser, 'name' | 'email' | 'phone' | 'avatar' | 'department'>>,
    ): { ok: boolean; error?: string } => {
      if (!user) return { ok: false, error: 'Not signed in.' };
      if (patch.name !== undefined && !patch.name.trim()) {
        return { ok: false, error: 'Full name cannot be empty.' };
      }
      const all = loadUsers();

      if (patch.email !== undefined) {
        const emailClean = patch.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
          return { ok: false, error: 'Please enter a valid email address.' };
        }
        if (all.some((u) => u.id !== user.id && u.email.toLowerCase() === emailClean)) {
          return { ok: false, error: 'That email address is already used by another account.' };
        }
      }
      if (patch.phone !== undefined) {
        const normPhone = normalizePhoneForWhatsApp(patch.phone);
        if (normPhone.length < 9 || normPhone.length > 15) {
          return { ok: false, error: 'Please enter a valid phone number.' };
        }
        if (all.some((u) => u.id !== user.id && normalizePhoneForWhatsApp(u.phone) === normPhone)) {
          return { ok: false, error: 'That phone number is already registered to another staff account.' };
        }
      }

      const updated = all.map((u) =>
        u.id === user.id
          ? {
              ...u,
              ...patch,
              name: patch.name !== undefined ? patch.name.trim() : u.name,
              email: patch.email !== undefined ? patch.email.trim().toLowerCase() : u.email,
              phone: patch.phone !== undefined ? formatLocalDisplayPhone(patch.phone) : u.phone,
              department: patch.department !== undefined ? patch.department.trim() : u.department,
              updated_at: new Date().toISOString(),
            }
          : u,
      );
      saveUsers(updated);
      setStoredUsers(updated);
      const updatedSelf = updated.find((u) => u.id === user.id);
      if (updatedSelf) {
        setUser(toPublicUser(updatedSelf, user.sessionExpiresAt));
      }

      appendAudit({
        action: 'Updated Personal Profile',
        category: 'profile',
        targetName: patch.name || user.name,
        details: `Updated profile fields (${Object.keys(patch).join(', ')})`,
      });
      return { ok: true };
    },
    [user, appendAudit],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> => {
      if (!user) return { ok: false, error: 'Not authenticated.' };
      const all = loadUsers();
      const idx = all.findIndex((u) => u.id === user.id);
      if (idx === -1) return { ok: false, error: 'User record not found.' };

      const currentHash = hashSecret(currentPassword);
      if (all[idx].passwordHash !== currentHash) {
        return { ok: false, error: 'Current password is incorrect.' };
      }

      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return { ok: false, error: strength.message };
      }

      if (currentPassword === newPassword) {
        return { ok: false, error: 'New password must be different from your current password.' };
      }

      all[idx] = {
        ...all[idx],
        passwordHash: hashSecret(newPassword),
        mustChangePassword: false,
        updated_at: new Date().toISOString(),
      };
      saveUsers(all);
      setStoredUsers([...all]);
      setUser(toPublicUser(all[idx], user.sessionExpiresAt));

      appendAudit({
        action: 'Changed Account Password',
        category: 'security',
        targetName: user.name,
        details: 'Password securely updated with salted hash verification.',
      });

      return { ok: true };
    },
    [user, appendAudit],
  );

  const changePin = useCallback(
    async (currentPassword: string, newPin: string): Promise<{ ok: boolean; error?: string }> => {
      if (!user) return { ok: false, error: 'Not authenticated.' };
      const cleanPin = (newPin || '').replace(/\D/g, '');
      if (cleanPin.length !== 4) {
        return { ok: false, error: 'PIN must be exactly 4 digits.' };
      }
      const all = loadUsers();
      const idx = all.findIndex((u) => u.id === user.id);
      if (idx === -1) return { ok: false, error: 'User record not found.' };

      if (all[idx].passwordHash !== hashSecret(currentPassword)) {
        return { ok: false, error: 'Current password is incorrect.' };
      }

      all[idx] = {
        ...all[idx],
        pinHash: hashSecret(cleanPin),
        updated_at: new Date().toISOString(),
      };
      saveUsers(all);
      setStoredUsers([...all]);
      setUser(toPublicUser(all[idx], user.sessionExpiresAt));

      appendAudit({
        action: 'Updated 4-Digit Quick PIN',
        category: 'security',
        targetName: user.name,
        details: 'Personal 4-digit PIN updated with salted hash verification.',
      });

      return { ok: true };
    },
    [user, appendAudit],
  );

  // ---------------------------------------------------------------------------
  // Administrator: Staff Account Management
  // ---------------------------------------------------------------------------
  const createUser = useCallback(
    async (input: {
      name: string;
      email: string;
      phone: string;
      roleId: string;
      department?: string;
      status: AccountStatus;
      authMethods?: AuthMethodPolicy;
      onboardingMethod: 'activation_link' | 'temp_password';
      customPassword?: string;
      pin?: string;
    }): Promise<{ ok: boolean; error?: string; user?: AuthUser; secret?: UserOnboardingSecret }> => {
      const permCheck = verifyBackendPermission('users', 'create');
      if (!permCheck.allowed) {
        return { ok: false, error: permCheck.reason };
      }

      const nameClean = input.name.trim();
      const emailClean = input.email.trim().toLowerCase();
      const phoneClean = input.phone.trim();

      if (!nameClean || !emailClean || !phoneClean) {
        return { ok: false, error: 'Full name, email address, and registered phone number are required.' };
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
        return { ok: false, error: 'Please enter a valid email address.' };
      }
      const normPhone = normalizePhoneForWhatsApp(phoneClean);
      if (normPhone.length < 9 || normPhone.length > 15) {
        return { ok: false, error: 'Please enter a valid phone number (e.g., 0712345678).' };
      }

      const all = loadUsers();
      if (all.some((u) => normalizePhoneForWhatsApp(u.phone) === normPhone)) {
        return { ok: false, error: 'A staff account with this phone number is already registered.' };
      }
      if (all.some((u) => u.email.toLowerCase() === emailClean)) {
        return { ok: false, error: 'A staff account with this email address already exists.' };
      }

      const currentRoles = loadRolesFromStorage();
      const roleObj = currentRoles.find((r) => r.id === input.roleId && r.status === 'active');
      if (!roleObj) {
        return { ok: false, error: 'Please select a valid active role.' };
      }

      const authMethods: AuthMethodPolicy = {
        pin: input.authMethods?.pin !== undefined ? !!input.authMethods.pin : true,
        password: input.authMethods?.password !== undefined ? !!input.authMethods.password : true,
      };
      if (!authMethods.pin && !authMethods.password) {
        return { ok: false, error: 'At least one authentication method (PIN or Password) must be enabled.' };
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const loginUrl = `${origin}/login`;

      const tempPassword = input.customPassword?.trim() || generateTempPassword();
      const initialPin = input.pin && /^\d{4}$/.test(input.pin) ? input.pin : generateRandomPin();
      const activationToken =
        input.onboardingMethod === 'activation_link' ? generateActivationToken() : undefined;
      const activationLink = activationToken ? `${loginUrl}?activate=${activationToken}` : undefined;

      const newUser: StoredUser = {
        id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: nameClean,
        email: emailClean,
        phone: formatLocalDisplayPhone(phoneClean),
        role: roleObj.id,
        roleTitle: roleObj.name,
        department: input.department?.trim() || '',
        status: input.status || 'active',
        authMethods,
        pinHash: hashSecret(initialPin),
        passwordHash: hashSecret(tempPassword),
        mustChangePassword: true,
        activationTokenHash: activationToken ? hashSecret(activationToken) : null,
        activationExpiresAt: activationToken ? new Date(Date.now() + 72 * 3600_000).toISOString() : null,
        failedAttempts: 0,
        lockedUntil: null,
        last_login_at: null,
        sessionVersion: 1,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(nameClean)}&background=6D28D9&color=FAE29C&bold=true`,
        created_at: new Date().toISOString(),
      };

      const next = [newUser, ...all];
      saveUsers(next);
      setStoredUsers(next);

      const pub = toPublicUser(newUser);
      const secret: UserOnboardingSecret = {
        method: input.onboardingMethod,
        tempPassword,
        initialPin: authMethods.pin ? initialPin : undefined,
        activationLink,
        activationToken,
        loginUrl,
      };

      appendAudit({
        action: 'Created Staff Account',
        category: 'user',
        targetName: newUser.name,
        details: `Phone: ${newUser.phone}, Role: "${roleObj.name}", Auth: [${
          [authMethods.pin ? 'PIN' : '', authMethods.password ? 'Password' : ''].filter(Boolean).join(' + ')
        }], Status: "${newUser.status}".`,
      });

      return { ok: true, user: pub, secret };
    },
    [appendAudit],
  );

  const updateUser = useCallback(
    (
      userId: string,
      patch: {
        name?: string;
        email?: string;
        phone?: string;
        roleId?: string;
        department?: string;
        status?: AccountStatus;
        authMethods?: AuthMethodPolicy;
        pin?: string;
      },
    ): { ok: boolean; error?: string } => {
      const permCheck = verifyBackendPermission('users', 'edit');
      if (!permCheck.allowed) {
        return { ok: false, error: permCheck.reason };
      }

      const all = loadUsers();
      const idx = all.findIndex((u) => u.id === userId);
      if (idx === -1) return { ok: false, error: 'Staff account not found.' };

      const target = all[idx];
      if (patch.email) {
        const cleanEmail = patch.email.trim().toLowerCase();
        if (all.some((u) => u.id !== userId && u.email.toLowerCase() === cleanEmail)) {
          return { ok: false, error: 'Email address is already in use by another staff member.' };
        }
      }
      if (patch.phone) {
        const normPhone = normalizePhoneForWhatsApp(patch.phone);
        if (normPhone.length < 9 || normPhone.length > 15) {
          return { ok: false, error: 'Please enter a valid phone number.' };
        }
        if (all.some((u) => u.id !== userId && normalizePhoneForWhatsApp(u.phone) === normPhone)) {
          return { ok: false, error: 'Phone number is already registered to another staff member.' };
        }
      }
      if (patch.authMethods && !patch.authMethods.pin && !patch.authMethods.password) {
        return { ok: false, error: 'At least one authentication method (PIN or Password) must remain enabled.' };
      }

      // Prevent demoting or deactivating the last active owner
      if (
        target.role === 'owner' &&
        ((patch.roleId && patch.roleId !== 'owner') || (patch.status && patch.status !== 'active'))
      ) {
        const activeOwners = all.filter((u) => u.role === 'owner' && u.status === 'active');
        if (activeOwners.length <= 1) {
          return {
            ok: false,
            error: 'Cannot demote or deactivate the last active Salon Owner / Administrator.',
          };
        }
      }

      const currentRoles = loadRolesFromStorage();
      let newRoleId = target.role;
      let newRoleTitle = target.roleTitle;
      if (patch.roleId) {
        const rObj = currentRoles.find((r) => r.id === patch.roleId);
        if (!rObj) return { ok: false, error: 'Selected role does not exist.' };
        newRoleId = rObj.id;
        newRoleTitle = rObj.name;
      }

      const nextStatus = patch.status !== undefined ? patch.status : target.status;
      const updatedUser: StoredUser = {
        ...target,
        name: patch.name !== undefined ? patch.name.trim() : target.name,
        email: patch.email !== undefined ? patch.email.trim().toLowerCase() : target.email,
        phone: patch.phone !== undefined ? formatLocalDisplayPhone(patch.phone) : target.phone,
        department: patch.department !== undefined ? patch.department.trim() : target.department,
        role: newRoleId,
        roleTitle: newRoleTitle,
        status: nextStatus,
        authMethods: patch.authMethods !== undefined ? patch.authMethods : target.authMethods,
        pinHash: patch.pin && /^\d{4}$/.test(patch.pin) ? hashSecret(patch.pin) : target.pinHash,
        failedAttempts: nextStatus === 'active' ? 0 : target.failedAttempts,
        lockedUntil: nextStatus === 'active' ? null : target.lockedUntil,
        updated_at: new Date().toISOString(),
      };

      all[idx] = updatedUser;
      saveUsers(all);
      setStoredUsers([...all]);

      if (user && user.id === userId) {
        setUser(toPublicUser(updatedUser, user.sessionExpiresAt));
      }

      appendAudit({
        action: 'Updated Staff Account',
        category: 'user',
        targetName: updatedUser.name,
        details: `Role: "${updatedUser.roleTitle}", Status: "${updatedUser.status}", Phone: ${updatedUser.phone}`,
      });

      return { ok: true };
    },
    [user, appendAudit],
  );

  const setUserStatus = useCallback(
    (userId: string, status: AccountStatus): { ok: boolean; error?: string } => {
      const res = updateUser(userId, { status });
      if (res.ok) {
        const target = storedUsers.find((u) => u.id === userId);
        appendAudit({
          action: `Account ${status.toUpperCase()}`,
          category: 'security',
          targetName: target?.name || userId,
          details: `Changed account status to "${status}".`,
        });
      }
      return res;
    },
    [updateUser, storedUsers, appendAudit],
  );

  const adminUnlockUser = useCallback(
    (userId: string): { ok: boolean; error?: string } => {
      const permCheck = verifyBackendPermission('users', 'edit');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      const all = loadUsers();
      const idx = all.findIndex((u) => u.id === userId);
      if (idx === -1) return { ok: false, error: 'Staff account not found.' };

      all[idx] = {
        ...all[idx],
        status: 'active',
        failedAttempts: 0,
        lockedUntil: null,
        updated_at: new Date().toISOString(),
      };
      saveUsers(all);
      setStoredUsers([...all]);

      appendAudit({
        action: 'Unlocked Staff Account',
        category: 'security',
        targetName: all[idx].name,
        details: `Cleared failed login attempts and unlocked account (${all[idx].phone}).`,
      });

      return { ok: true };
    },
    [appendAudit],
  );

  const adminResetUserPin = useCallback(
    (userId: string, customPin?: string): { ok: boolean; error?: string; generatedPin?: string } => {
      const permCheck = verifyBackendPermission('users', 'edit');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      const all = loadUsers();
      const idx = all.findIndex((u) => u.id === userId);
      if (idx === -1) return { ok: false, error: 'Staff account not found.' };

      const newPin = customPin && /^\d{4}$/.test(customPin) ? customPin : generateRandomPin();
      all[idx] = {
        ...all[idx],
        pinHash: hashSecret(newPin),
        authMethods: {
          ...all[idx].authMethods,
          pin: true,
        },
        failedAttempts: 0,
        lockedUntil: null,
        status: all[idx].status === 'locked' ? 'active' : all[idx].status,
        updated_at: new Date().toISOString(),
      };
      saveUsers(all);
      setStoredUsers([...all]);

      appendAudit({
        action: 'Reset Staff 4-Digit PIN',
        category: 'security',
        targetName: all[idx].name,
        details: `Administrator issued a new hashed 4-digit PIN for ${all[idx].name} (${all[idx].phone}).`,
      });

      return { ok: true, generatedPin: newPin };
    },
    [appendAudit],
  );

  const adminResetUserAccess = useCallback(
    (
      userId: string,
      method: 'activation_link' | 'temp_password',
    ): { ok: boolean; error?: string; secret?: UserOnboardingSecret } => {
      const permCheck = verifyBackendPermission('users', 'edit');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      const all = loadUsers();
      const idx = all.findIndex((u) => u.id === userId);
      if (idx === -1) return { ok: false, error: 'Staff account not found.' };

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const loginUrl = `${origin}/login`;
      const tempPassword = generateTempPassword();
      const initialPin = generateRandomPin();
      const activationToken = method === 'activation_link' ? generateActivationToken() : undefined;
      const activationLink = activationToken ? `${loginUrl}?activate=${activationToken}` : undefined;

      all[idx] = {
        ...all[idx],
        passwordHash: hashSecret(tempPassword),
        pinHash: hashSecret(initialPin),
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
        status: all[idx].status === 'locked' ? 'active' : all[idx].status,
        activationTokenHash: activationToken ? hashSecret(activationToken) : null,
        activationExpiresAt: activationToken ? new Date(Date.now() + 72 * 3600_000).toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      saveUsers(all);
      setStoredUsers([...all]);

      appendAudit({
        action: method === 'activation_link' ? 'Generated New Activation Link' : 'Reset Staff Password & PIN',
        category: 'security',
        targetName: all[idx].name,
        details: `Issued new ${method} credentials for ${all[idx].name} (${all[idx].phone}).`,
      });

      return {
        ok: true,
        secret: {
          method,
          tempPassword,
          initialPin: all[idx].authMethods?.pin ? initialPin : undefined,
          activationLink,
          activationToken,
          loginUrl,
        },
      };
    },
    [appendAudit],
  );

  const adminRevokeUserSession = useCallback(
    (userId: string): { ok: boolean; error?: string } => {
      const permCheck = verifyBackendPermission('users', 'edit');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      const all = loadUsers();
      const idx = all.findIndex((u) => u.id === userId);
      if (idx === -1) return { ok: false, error: 'Staff account not found.' };

      all[idx] = {
        ...all[idx],
        sessionVersion: (all[idx].sessionVersion || 1) + 1,
        updated_at: new Date().toISOString(),
      };
      saveUsers(all);
      setStoredUsers([...all]);

      appendAudit({
        action: 'Revoked Active Sessions',
        category: 'security',
        targetName: all[idx].name,
        details: `Incremented session version to invalidate active sessions for ${all[idx].name}.`,
      });

      return { ok: true };
    },
    [appendAudit],
  );

  const deleteUser = useCallback(
    (userId: string): { ok: boolean; error?: string } => {
      const permCheck = verifyBackendPermission('users', 'delete');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      if (user && user.id === userId) {
        return { ok: false, error: 'You cannot delete your own currently signed-in account.' };
      }

      const all = loadUsers();
      const target = all.find((u) => u.id === userId);
      if (!target) return { ok: false, error: 'Staff account not found.' };

      if (target.role === 'owner') {
        const owners = all.filter((u) => u.role === 'owner');
        if (owners.length <= 1) {
          return { ok: false, error: 'Cannot delete the last protected Salon Owner / Administrator.' };
        }
      }

      const next = all.filter((u) => u.id !== userId);
      saveUsers(next);
      setStoredUsers(next);

      appendAudit({
        action: 'Deleted Staff Account',
        category: 'user',
        targetName: target.name,
        details: `Removed staff account ${target.name} (${target.phone}, role: ${target.roleTitle}).`,
      });

      return { ok: true };
    },
    [user, appendAudit],
  );

  // ---------------------------------------------------------------------------
  // Dynamic Roles & Granular Permissions
  // ---------------------------------------------------------------------------
  const createRole = useCallback(
    (input: {
      name: string;
      description: string;
      badge?: string;
      status?: RoleStatus;
      granularPermissions?: Record<SystemModuleKey, ModulePermissionSet>;
    }): { ok: boolean; error?: string; role?: RoleDefinition } => {
      const permCheck = verifyBackendPermission('roles', 'create');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      const nameClean = input.name.trim();
      if (!nameClean) return { ok: false, error: 'Role name is required.' };

      const current = loadRolesFromStorage();
      const slug = nameClean
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      const roleId = current.some((r) => r.id === slug) ? `${slug}_${Date.now().toString(36)}` : slug;

      if (current.some((r) => r.name.toLowerCase() === nameClean.toLowerCase())) {
        return { ok: false, error: 'A role with this name already exists.' };
      }

      const defaultGranular: Record<SystemModuleKey, ModulePermissionSet> = {
        dashboard: makePerm(true, false, false, false, false),
        users: noPerm(),
        roles: noPerm(),
        inventory: makePerm(true, false, false, false, false),
        purchases: noPerm(),
        expenses: noPerm(),
        services: makePerm(true, false, false, false, false),
        sales: makePerm(true, true, false, false, false),
        customers: makePerm(true, true, false, false, false),
        reports: noPerm(),
        categories: noPerm(),
        settings: noPerm(),
      };

      const granular = input.granularPermissions || defaultGranular;
      const newRole: RoleDefinition = {
        id: roleId,
        name: nameClean,
        description: input.description.trim() || 'Custom salon role with tailored module permissions.',
        badge: input.badge?.trim() || 'Custom Role',
        status: input.status || 'active',
        isSystem: false,
        granularPermissions: granular,
        permissions: syncLegacyPermissionsMap(granular),
        created_at: new Date().toISOString(),
      };

      const next = [...current, newRole];
      saveRolesToStorage(next);
      setRoles(next);

      appendAudit({
        action: 'Created Custom Role',
        category: 'role',
        targetName: newRole.name,
        details: `Created role "${newRole.name}" (${newRole.id}) with status "${newRole.status}".`,
      });

      return { ok: true, role: newRole };
    },
    [appendAudit],
  );

  const updateRole = useCallback(
    (
      roleId: string,
      patch: { name?: string; description?: string; badge?: string; status?: RoleStatus },
    ): { ok: boolean; error?: string } => {
      const permCheck = verifyBackendPermission('roles', 'edit');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      const current = loadRolesFromStorage();
      const idx = current.findIndex((r) => r.id === roleId);
      if (idx === -1) return { ok: false, error: 'Role not found.' };

      if (roleId === 'owner' && patch.status === 'archived') {
        return { ok: false, error: 'The protected Owner / Administrator role cannot be archived.' };
      }

      const updatedRole: RoleDefinition = {
        ...current[idx],
        name: patch.name !== undefined ? patch.name.trim() : current[idx].name,
        description: patch.description !== undefined ? patch.description.trim() : current[idx].description,
        badge: patch.badge !== undefined ? patch.badge.trim() : current[idx].badge,
        status: patch.status !== undefined ? patch.status : current[idx].status,
        updated_at: new Date().toISOString(),
      };
      current[idx] = updatedRole;
      saveRolesToStorage(current);
      setRoles([...current]);

      if (patch.name) {
        const allUsers = loadUsers().map((u) => (u.role === roleId ? { ...u, roleTitle: updatedRole.name } : u));
        saveUsers(allUsers);
        setStoredUsers(allUsers);
        if (user && user.role === roleId) {
          setUser((prev) => (prev ? { ...prev, roleTitle: updatedRole.name } : null));
        }
      }

      appendAudit({
        action: 'Updated Role Definition',
        category: 'role',
        targetName: updatedRole.name,
        details: `Updated role "${updatedRole.name}" (Status: ${updatedRole.status}).`,
      });

      return { ok: true };
    },
    [user, appendAudit],
  );

  const setRolePermission = useCallback(
    (
      roleId: string,
      moduleKey: SystemModuleKey,
      action: PermissionAction,
      allowed: boolean,
    ): { ok: boolean; error?: string } => {
      const permCheck = verifyBackendPermission('roles', 'edit');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      if (roleId === 'owner' && (moduleKey === 'roles' || moduleKey === 'settings' || moduleKey === 'users')) {
        return { ok: false, error: 'Owner / Administrator must retain full access to Users, Roles, and Settings.' };
      }

      const current = loadRolesFromStorage();
      const idx = current.findIndex((r) => r.id === roleId);
      if (idx === -1) return { ok: false, error: 'Role not found.' };

      const role = current[idx];
      const prevMod = role.granularPermissions[moduleKey] || noPerm();
      const nextMod: ModulePermissionSet = { ...prevMod, [action]: allowed };

      if (allowed && action !== 'view') {
        nextMod.view = true;
      }
      if (!allowed && action === 'view') {
        nextMod.create = false;
        nextMod.edit = false;
        nextMod.delete = false;
        nextMod.export = false;
      }

      const nextGranular = {
        ...role.granularPermissions,
        [moduleKey]: nextMod,
      };

      current[idx] = {
        ...role,
        granularPermissions: nextGranular,
        permissions: syncLegacyPermissionsMap(nextGranular),
        updated_at: new Date().toISOString(),
      };
      saveRolesToStorage(current);
      setRoles([...current]);

      appendAudit({
        action: 'Updated Granular Permission',
        category: 'permission',
        targetName: role.name,
        details: `${allowed ? 'Granted' : 'Revoked'} "${action.toUpperCase()}" on module "${moduleKey}" for role "${role.name}".`,
      });

      return { ok: true };
    },
    [appendAudit],
  );

  const setModuleAllPermissions = useCallback(
    (roleId: string, moduleKey: SystemModuleKey, enabled: boolean): { ok: boolean; error?: string } => {
      const permCheck = verifyBackendPermission('roles', 'edit');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      if (roleId === 'owner' && !enabled && (moduleKey === 'roles' || moduleKey === 'settings' || moduleKey === 'users')) {
        return { ok: false, error: 'Owner / Administrator must retain full access to Users, Roles, and Settings.' };
      }

      const current = loadRolesFromStorage();
      const idx = current.findIndex((r) => r.id === roleId);
      if (idx === -1) return { ok: false, error: 'Role not found.' };

      const role = current[idx];
      const nextGranular = {
        ...role.granularPermissions,
        [moduleKey]: enabled ? fullPerm() : noPerm(),
      };

      current[idx] = {
        ...role,
        granularPermissions: nextGranular,
        permissions: syncLegacyPermissionsMap(nextGranular),
        updated_at: new Date().toISOString(),
      };
      saveRolesToStorage(current);
      setRoles([...current]);

      appendAudit({
        action: enabled ? 'Enabled All Module Actions' : 'Revoked Module Access',
        category: 'permission',
        targetName: role.name,
        details: `${enabled ? 'Enabled all permissions' : 'Disabled all permissions'} on "${moduleKey}" for "${role.name}".`,
      });

      return { ok: true };
    },
    [appendAudit],
  );

  const deleteRole = useCallback(
    (roleId: string, reassignToRoleId?: string): { ok: boolean; error?: string } => {
      const permCheck = verifyBackendPermission('roles', 'delete');
      if (!permCheck.allowed) return { ok: false, error: permCheck.reason };

      if (roleId === 'owner') {
        return { ok: false, error: 'The protected Salon Owner / Administrator role cannot be deleted.' };
      }

      const current = loadRolesFromStorage();
      const targetRole = current.find((r) => r.id === roleId);
      if (!targetRole) return { ok: false, error: 'Role not found.' };

      const allUsers = loadUsers();
      const assignedUsers = allUsers.filter((u) => u.role === roleId);

      if (assignedUsers.length > 0) {
        if (!reassignToRoleId) {
          return {
            ok: false,
            error: `This role is currently assigned to ${assignedUsers.length} user(s). Please select a replacement role to reassign them before deleting.`,
          };
        }
        const replacement = current.find((r) => r.id === reassignToRoleId && r.id !== roleId && r.status === 'active');
        if (!replacement) {
          return { ok: false, error: 'Please choose a valid active replacement role.' };
        }
        const reassignedUsers = allUsers.map((u) =>
          u.role === roleId ? { ...u, role: replacement.id, roleTitle: replacement.name } : u,
        );
        saveUsers(reassignedUsers);
        setStoredUsers(reassignedUsers);
      }

      const nextRoles = current.filter((r) => r.id !== roleId);
      saveRolesToStorage(nextRoles);
      setRoles(nextRoles);

      appendAudit({
        action: 'Removed Role',
        category: 'role',
        targetName: targetRole.name,
        details:
          assignedUsers.length > 0
            ? `Deleted role "${targetRole.name}" after reassigning ${assignedUsers.length} user(s) to "${reassignToRoleId}".`
            : `Deleted unused role "${targetRole.name}".`,
      });

      return { ok: true };
    },
    [appendAudit],
  );

  const logout = useCallback(() => {
    if (user) {
      appendAudit(
        {
          action: 'Signed Out',
          category: 'security',
          targetName: user.name,
          details: `Session terminated securely for ${user.name}.`,
        },
        { name: user.name, roleTitle: user.roleTitle },
      );
    }
    setUser(null);
  }, [user, appendAudit]);

  const canPerform = useCallback(
    (moduleKey: SystemModuleKey, action: PermissionAction = 'view'): boolean => {
      if (!user) return false;
      if (user.status && user.status !== 'active') return false;
      if (user.role === 'owner') return true;

      const roleDef = roles.find((r) => r.id === user.role);
      if (!roleDef || roleDef.status === 'archived') return false;

      const modPerm = roleDef.granularPermissions?.[moduleKey];
      if (!modPerm) return false;
      return !!modPerm[action];
    },
    [user, roles],
  );

  const hasPermission = useCallback(
    (moduleKey: string): boolean => {
      return canPerform(moduleKey as SystemModuleKey, 'view');
    },
    [canPerform],
  );

  const activeRoles = roles.filter((r) => r.status === 'active');

  return (
    <AuthContext.Provider
      value={{
        user,
        users: storedUsers.map((u) => toPublicUser(u)),
        roles,
        activeRoles,
        auditLogs,
        identifyUserByPhone,
        authenticateWithPin,
        authenticateWithPassword,
        login,
        loginWithPin,
        completeAccountActivation,
        requestRecoveryAssistance,
        logout,
        updateProfile,
        changePassword,
        changePin,
        createUser,
        updateUser,
        setUserStatus,
        adminUnlockUser,
        adminResetUserPin,
        adminResetUserAccess,
        adminRevokeUserSession,
        deleteUser,
        createRole,
        updateRole,
        setRolePermission,
        setModuleAllPermissions,
        deleteRole,
        hasPermission,
        canPerform,
        logAuditEvent: appendAudit,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
