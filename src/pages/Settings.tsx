import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Scissors,
  Users,
  Tag,
  Truck,
  Edit3,
  Check,
  ShieldCheck,
  Lock,
  UserCheck,
  UserPlus,
  Search,
  Share2,
  Copy,
  KeyRound,
  Ban,
  CheckCircle2,
  Archive,
  AlertTriangle,
  Eye,
  RefreshCw,
  FileText,
  User as UserIcon,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/StatusBadge';
import { Profile } from '@/pages/Profile';
import {
  useAuth,
  SYSTEM_MODULES,
  buildWhatsAppInvitationMessage,
  type AuthUser,
  type AccountStatus,
  type RoleDefinition,
  type RoleStatus,
  type SystemModuleKey,
  type PermissionAction,
  type UserOnboardingSecret,
} from '@/lib/auth';
import type { Service, Staff, Category, CategoryType, Supplier, Hairstyle, Product, Expense } from '@/lib/types';

type Tab = 'users' | 'permissions' | 'categories' | 'profile' | 'services' | 'security';

export function Settings() {
  const { t, lang } = useI18n();
  const { user, canPerform } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isOwner = user?.role === 'owner';
  const isManager = user?.role === 'manager';

  const rawTabs: { id: Tab; icon: typeof Scissors; label: string; allowed: boolean }[] = [
    {
      id: 'users',
      icon: Users,
      label: lang === 'sw' ? 'Usimamizi wa Watumiaji' : 'User Management',
      allowed: isOwner || (isManager && canPerform('users', 'view')),
    },
    {
      id: 'permissions',
      icon: ShieldCheck,
      label: lang === 'sw' ? 'Vyeo na Ruhusa (RBAC)' : 'Roles & Permissions',
      allowed: isOwner,
    },
    {
      id: 'categories',
      icon: Tag,
      label: lang === 'sw' ? 'Usimamizi wa Makundi' : 'Category Management',
      allowed: isOwner || isManager || canPerform('categories', 'view'),
    },
    {
      id: 'profile',
      icon: UserIcon,
      label: lang === 'sw' ? 'Wasifu Wangu' : 'My Profile',
      allowed: true,
    },
    {
      id: 'services',
      icon: Scissors,
      label: lang === 'sw' ? 'Huduma, Wafanyakazi & Wasambazaji' : 'General & Salon Setup',
      allowed: isOwner || isManager || canPerform('settings', 'view'),
    },
    {
      id: 'security',
      icon: Lock,
      label: lang === 'sw' ? 'Usalama na Ukaguzi' : 'Security & Audit Trail',
      allowed: isOwner,
    },
  ];

  const tabs = rawTabs.filter((t) => t.allowed);
  const initialTabParam = searchParams.get('tab') as Tab;
  const initialTab = (tabs.some((t) => t.id === initialTabParam) ? initialTabParam : tabs[0]?.id) || 'profile';
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab) && tabs.length > 0) {
      setTab(tabs[0].id);
    }
  }, [tabs, tab]);

  const selectTab = (next: Tab) => {
    setTab(next);
    setSearchParams({ tab: next });
  };

  if (tabs.length === 0) {
    return (
      <div className="panel p-8 max-w-lg mx-auto my-12 text-center space-y-4">
        <h2 className="text-lg font-extrabold text-[#111827]">
          {lang === 'sw' ? 'Huna Ruhusa ya Kufungua Ukurasa Huu' : 'Access Restricted'}
        </h2>
        <p className="text-xs text-[#4B5563]">
          {lang === 'sw'
            ? 'Akaunti yako haina ruhusa ya kubadili mipangilio ya saluni. Tafadhali wasiliana na Mkurugenzi.'
            : 'Your staff account does not have permission to view salon settings. Please contact the salon owner.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-ink-900">{t('settings')}</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          {lang === 'sw'
            ? 'Usimamizi wa Watumiaji · Vyeo na Ruhusa (RBAC) · Makundi · Wasifu · Huduma za Saluni · Kumbukumbu za Usalama'
            : 'User Management · Dynamic Roles & Granular RBAC · Categories · Admin Profile · Salon Setup · Security Audit'}
        </p>
      </div>

      {/* Tab Selector */}
      <div className="flex gap-2 flex-wrap bg-white p-1.5 rounded-2xl border border-[#ece8f5] shadow-2xs">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          const isActive = tab === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => selectTab(tb.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-[#6d28d9] text-white shadow-sm'
                  : 'text-ink-600 hover:bg-[#f6f2fd] hover:text-ink-900'
              }`}
            >
              <Icon size={16} /> {tb.label}
            </button>
          );
        })}
      </div>

      {tab === 'users' && <UserManagementTab canManage={isOwner} />}
      {tab === 'permissions' && isOwner && <RolesAndPermissionsTab />}
      {tab === 'categories' && <CategoriesManagementTab />}
      {tab === 'profile' && <Profile embedded />}
      {tab === 'services' && <GeneralSalonSetupTab />}
      {tab === 'security' && isOwner && <SecurityAuditTab />}
    </div>
  );
}

// ===========================================================================
// PHASE 3 & SECTION 5: ADMINISTRATOR STAFF ACCOUNT MANAGEMENT & WHATSAPP INVITE
// ===========================================================================
function UserManagementTab({ canManage }: { canManage: boolean }) {
  const { lang, t } = useI18n();
  const { notify } = useToast();
  const {
    user: currentUser,
    users,
    roles,
    activeRoles,
    createUser,
    updateUser,
    setUserStatus,
    adminUnlockUser,
    adminResetUserPin,
    adminResetUserAccess,
    adminRevokeUserSession,
    deleteUser,
    canPerform,
  } = useAuth();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');

  // Add / Edit Staff Account Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [viewingUser, setViewingUser] = useState<AuthUser | null>(null);
  const [formError, setFormError] = useState('');

  // One-time PIN Reset Reveal Modal
  const [pinResetContext, setPinResetContext] = useState<{
    targetUser: AuthUser;
    generatedPin: string;
  } | null>(null);

  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    roleId: activeRoles[1]?.id || activeRoles[0]?.id || 'manager',
    status: 'active' as AccountStatus,
    authMethods: { pin: true, password: true },
    onboardingMethod: 'activation_link' as 'activation_link' | 'temp_password',
    customPassword: '',
    pin: '',
  });

  // WhatsApp Invitation & Credentials Modal
  const [inviteContext, setInviteContext] = useState<{
    targetUser: AuthUser;
    secret: UserOnboardingSecret;
  } | null>(null);

  const openAddUser = () => {
    setEditingUser(null);
    setFormError('');
    setUserForm({
      name: '',
      email: '',
      phone: '',
      department: '',
      roleId: activeRoles.find((r) => r.id !== 'owner')?.id || activeRoles[0]?.id || 'manager',
      status: 'active',
      authMethods: { pin: true, password: true },
      onboardingMethod: 'activation_link',
      customPassword: '',
      pin: '',
    });
    setShowUserModal(true);
  };

  const openEditUser = (u: AuthUser) => {
    setEditingUser(u);
    setFormError('');
    setUserForm({
      name: u.name,
      email: u.email,
      phone: u.phone,
      department: u.department || '',
      roleId: u.role,
      status: u.status || 'active',
      authMethods: {
        pin: u.authMethods?.pin !== false,
        password: u.authMethods?.password !== false,
      },
      onboardingMethod: 'activation_link',
      customPassword: '',
      pin: '', // Never prefill or expose existing PIN
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!userForm.authMethods.pin && !userForm.authMethods.password) {
      setFormError(
        lang === 'sw'
          ? 'Chagua angalau njia moja ya kuingia (PIN au Nywila).'
          : 'At least one authentication method (PIN or Password) must be enabled.',
      );
      return;
    }

    if (editingUser) {
      const res = updateUser(editingUser.id, {
        name: userForm.name,
        email: userForm.email,
        phone: userForm.phone,
        department: userForm.department,
        roleId: userForm.roleId,
        status: userForm.status,
        authMethods: userForm.authMethods,
        pin: userForm.pin.length === 4 ? userForm.pin : undefined,
      });
      if (!res.ok) {
        setFormError(res.error || 'Could not update staff account.');
        return;
      }
      notify(lang === 'sw' ? 'Taarifa za mfanyakazi zimesasishwa!' : 'Staff account updated!');
      setShowUserModal(false);
    } else {
      const res = await createUser({
        name: userForm.name,
        email: userForm.email,
        phone: userForm.phone,
        department: userForm.department,
        roleId: userForm.roleId,
        status: userForm.status,
        authMethods: userForm.authMethods,
        onboardingMethod: userForm.onboardingMethod,
        customPassword: userForm.customPassword,
        pin: userForm.pin.length === 4 ? userForm.pin : undefined,
      });
      if (!res.ok || !res.user || !res.secret) {
        setFormError(res.error || 'Could not create staff account.');
        return;
      }
      notify(lang === 'sw' ? 'Mfanyakazi mpya ameongezwa!' : 'New staff account created!');
      setShowUserModal(false);
      setInviteContext({ targetUser: res.user, secret: res.secret });
    }
  };

  const handleTriggerWhatsAppInvite = (u: AuthUser, method: 'activation_link' | 'temp_password') => {
    const res = adminResetUserAccess(u.id, method);
    if (!res.ok || !res.secret) {
      notify(res.error || 'Failed to generate credentials.', 'error');
      return;
    }
    setInviteContext({ targetUser: u, secret: res.secret });
  };

  const handleResetPin = (u: AuthUser) => {
    const res = adminResetUserPin(u.id);
    if (!res.ok || !res.generatedPin) {
      notify(res.error || 'Failed to reset PIN.', 'error');
      return;
    }
    setPinResetContext({ targetUser: u, generatedPin: res.generatedPin });
    notify(lang === 'sw' ? 'PIN mpya imetengenezwa!' : 'New 4-digit PIN generated!');
  };

  const handleUnlockAccount = (u: AuthUser) => {
    const res = adminUnlockUser(u.id);
    if (!res.ok) {
      notify(res.error || 'Could not unlock account.', 'error');
      return;
    }
    notify(lang === 'sw' ? `Akaunti ya ${u.name} imefunguliwa!` : `${u.name}'s account has been unlocked!`);
  };

  const handleRevokeSession = (u: AuthUser) => {
    const res = adminRevokeUserSession(u.id);
    if (!res.ok) {
      notify(res.error || 'Could not revoke session.', 'error');
      return;
    }
    notify(lang === 'sw' ? 'Vikao vya sasa vimefutwa.' : `Active sessions revoked for ${u.name}.`);
  };

  const handleStatusChange = (u: AuthUser, nextStatus: AccountStatus) => {
    if (
      nextStatus !== 'active' &&
      !confirm(
        lang === 'sw'
          ? `Je, una uhakika unataka kubadili hali ya akaunti ya ${u.name} kuwa "${nextStatus}"?`
          : `Are you sure you want to set ${u.name}'s account status to "${nextStatus.toUpperCase()}"?`,
      )
    ) {
      return;
    }
    const res = setUserStatus(u.id, nextStatus);
    if (!res.ok) {
      notify(res.error || 'Action failed.', 'error');
      return;
    }
    notify(lang === 'sw' ? 'Hali ya akaunti imebadilishwa.' : `Account status updated to ${nextStatus}.`);
  };

  const handleDeleteUser = (u: AuthUser) => {
    if (
      !confirm(
        lang === 'sw'
          ? `Je, una uhakika unataka kumfuta kabisa mtumiaji ${u.name}?`
          : `Are you sure you want to permanently remove staff account "${u.name}"?`,
      )
    ) {
      return;
    }
    const res = deleteUser(u.id);
    if (!res.ok) {
      notify(res.error || 'Could not delete user.', 'error');
      return;
    }
    notify(t('deleted'));
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && (u.status || 'active') !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone.toLowerCase().includes(q) ||
          u.roleTitle.toLowerCase().includes(q) ||
          (u.department || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, search]);

  const statusBadge = (status: AccountStatus) => {
    if (status === 'active') {
      return <span className="badge bg-[#DCFCE7] text-[#15803D]">Active</span>;
    }
    if (status === 'locked') {
      return <span className="badge bg-[#FEF3C7] text-[#B45309]">Locked</span>;
    }
    if (status === 'suspended') {
      return <span className="badge bg-[#FEE2E2] text-[#DC2626]">Suspended</span>;
    }
    return <span className="badge bg-[#F1F5F9] text-[#475569]">Inactive</span>;
  };

  const authMethodBadge = (u: AuthUser) => {
    const pinOn = u.authMethods?.pin !== false;
    const pwOn = u.authMethods?.password !== false;
    if (pinOn && pwOn) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] text-[11px] font-bold">
          PIN + Password
        </span>
      );
    }
    if (pinOn) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FDFAEF] border border-[#F4DE9E] text-[#975415] text-[11px] font-bold">
          PIN Only
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#F1F5F9] text-[#334155] text-[11px] font-bold">
        Password Only
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Add Staff Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-[#111827] text-base">
            {lang === 'sw'
              ? 'Usimamizi wa Akaunti za Wafanyakazi (Administrator-Controlled)'
              : 'Administrator Staff Account Management'}
          </h3>
          <p className="text-xs text-[#4B5563]">
            {lang === 'sw'
              ? 'Sajili wafanyakazi kwa namba za simu, dhibiti njia za kuingia (PIN / Nywila), vyeo na hali ya akaunti'
              : 'Register staff phone numbers, configure PIN & Password login policies, assign roles, and manage credentials'}
          </p>
        </div>

        {canPerform('users', 'create') && (
          <button onClick={openAddUser} className="btn btn-primary">
            <UserPlus size={16} />
            <span>{lang === 'sw' ? 'Sajili Mfanyakazi Mpya' : 'Add Staff Account'}</span>
          </button>
        )}
      </div>

      {/* Search + Role Filter + Status Filter */}
      <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            className="input pl-10"
            placeholder={
              lang === 'sw'
                ? 'Tafuta kwa jina, namba ya simu, barua pepe au cheo...'
                : 'Search staff by name, phone number, email, department, or role...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <select className="input w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">{lang === 'sw' ? 'Vyeo Vyote (All Roles)' : 'All Roles'}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} {r.status === 'archived' ? '(Archived)' : ''}
              </option>
            ))}
          </select>

          <select
            className="input w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | AccountStatus)}
          >
            <option value="all">{lang === 'sw' ? 'Hali Zote (All Statuses)' : 'All Statuses'}</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="locked">Locked</option>
          </select>
        </div>
      </div>

      {/* Staff Accounts Table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f6fc] text-ink-600 border-b border-[#ece8f5] text-xs uppercase">
              <tr>
                <th className="text-left font-bold px-4 py-3.5">{lang === 'sw' ? 'Mfanyakazi' : 'Staff Name'}</th>
                <th className="text-left font-bold px-4 py-3.5">{lang === 'sw' ? 'Namba ya Simu' : 'Phone Number'}</th>
                <th className="text-left font-bold px-4 py-3.5">{lang === 'sw' ? 'Cheo (Role)' : 'Assigned Role'}</th>
                <th className="text-center font-bold px-4 py-3.5">
                  {lang === 'sw' ? 'Njia ya Kuingia' : 'Auth Method'}
                </th>
                <th className="text-center font-bold px-4 py-3.5">{lang === 'sw' ? 'Hali' : 'Account Status'}</th>
                <th className="text-left font-bold px-4 py-3.5">
                  {lang === 'sw' ? 'Tarehe & Kuingia Mwisho' : 'Added / Last Login'}
                </th>
                <th className="text-right font-bold px-4 py-3.5">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1edf8]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-ink-400">
                    {t('noData')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = currentUser?.id === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-[#faf8fe]">
                      {/* Staff Identity */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={u.avatar}
                            alt={u.name}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-[#EDE9FE]"
                          />
                          <div>
                            <div className="font-bold text-[#111827] flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isSelf && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F5F3FF] text-[#6D28D9] font-extrabold">
                                  YOU
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#6B7280]">
                              {u.department || u.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Phone & Email */}
                      <td className="px-4 py-3.5 text-xs">
                        <p className="font-mono font-extrabold text-[#111827]">{u.phone}</p>
                        <p className="text-[#6B7280] mt-0.5">{u.email}</p>
                      </td>

                      {/* Dynamic Role Selector */}
                      <td className="px-4 py-3.5">
                        {canManage ? (
                          <select
                            className="input py-1.5 px-2.5 text-xs font-bold w-auto bg-[#F5F3FF] text-[#6D28D9] border-[#DDD6FE]"
                            value={u.role}
                            onChange={(e) => {
                              const res = updateUser(u.id, { roleId: e.target.value });
                              if (!res.ok) notify(res.error || 'Error', 'error');
                              else notify(lang === 'sw' ? 'Cheo kimebadilishwa!' : 'Staff role updated!');
                            }}
                          >
                            {activeRoles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="badge bg-[#F5F3FF] text-[#6D28D9]">{u.roleTitle}</span>
                        )}
                      </td>

                      {/* Authentication Method */}
                      <td className="px-4 py-3.5 text-center">{authMethodBadge(u)}</td>

                      {/* Account Status */}
                      <td className="px-4 py-3.5 text-center">{statusBadge(u.status || 'active')}</td>

                      {/* Date Added & Last Login */}
                      <td className="px-4 py-3.5 text-xs">
                        <p className="text-[#1F2937] font-medium">
                          <span className="text-[#6B7280]">Added:</span> {formatDateTime(u.created_at)}
                        </p>
                        <p className="text-[#6B7280] mt-0.5">
                          <span>Last login:</span>{' '}
                          {u.last_login_at ? (
                            <strong className="text-[#098F50]">{formatDateTime(u.last_login_at)}</strong>
                          ) : (
                            'Never'
                          )}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingUser(u)}
                            className="p-1.5 text-ink-400 hover:text-[#6D28D9] hover:bg-[#F5F3FF] rounded-lg"
                            title="View Staff Details"
                          >
                            <Eye size={15} />
                          </button>

                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditUser(u)}
                                className="p-1.5 text-ink-400 hover:text-[#6D28D9] hover:bg-[#F5F3FF] rounded-lg"
                                title="Edit Staff Account & Auth Policy"
                              >
                                <Edit3 size={15} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleResetPin(u)}
                                className="px-2 py-1 rounded-lg bg-[#F5F3FF] text-[#6D28D9] hover:bg-[#EDE9FE] text-[11px] font-bold transition"
                                title="Generate new 4-digit PIN"
                              >
                                Reset PIN
                              </button>

                              <button
                                type="button"
                                onClick={() => handleTriggerWhatsAppInvite(u, 'temp_password')}
                                className="px-2 py-1 rounded-lg bg-[#F1F5F9] text-[#334155] hover:bg-[#E2E8F0] text-[11px] font-bold transition"
                                title="Reset Password & Share via WhatsApp"
                              >
                                Reset PW
                              </button>

                              <button
                                type="button"
                                onClick={() => handleTriggerWhatsAppInvite(u, 'activation_link')}
                                className="p-1.5 rounded-lg bg-[#DCFCE7] text-[#15803D] hover:bg-[#BBF7D0] transition"
                                title="Share Login Details via WhatsApp"
                              >
                                <Share2 size={14} />
                              </button>

                              {u.status === 'locked' ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnlockAccount(u)}
                                  className="px-2 py-1 rounded-lg bg-[#FEF3C7] text-[#B45309] hover:bg-[#FDE68A] text-[11px] font-bold"
                                  title="Unlock Locked Account"
                                >
                                  Unlock
                                </button>
                              ) : u.status !== 'active' ? (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(u, 'active')}
                                  className="p-1.5 text-[#16A34A] hover:bg-[#DCFCE7] rounded-lg"
                                  title="Activate Account"
                                >
                                  <CheckCircle2 size={15} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(u, 'inactive')}
                                  className="p-1.5 text-[#D97706] hover:bg-[#FEF3C7] rounded-lg"
                                  title="Deactivate Account"
                                >
                                  <Ban size={15} />
                                </button>
                              )}

                              {canPerform('users', 'delete') && !isSelf && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg"
                                  title="Remove Staff Account"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =================================================================
          ADD / EDIT STAFF ACCOUNT MODAL
      ================================================================= */}
      <Modal
        open={showUserModal}
        onClose={() => setShowUserModal(false)}
        title={
          editingUser
            ? lang === 'sw'
              ? `Hariri Akaunti ya Mfanyakazi: ${editingUser.name}`
              : `Edit Staff Account: ${editingUser.name}`
            : lang === 'sw'
              ? 'Sajili Mfanyakazi Mpya'
              : 'Create New Staff Account'
        }
        size="lg"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          {formError && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs font-semibold text-[#DC2626]">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{lang === 'sw' ? 'Jina Kamili' : 'Full Name'} *</label>
              <input
                required
                className="input"
                placeholder="e.g., Zawadi Bakari"
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">
                {lang === 'sw' ? 'Namba ya Simu Iliyosajiliwa (Kuingia)' : 'Registered Phone Number (Login ID)'} *
              </label>
              <input
                required
                type="tel"
                className="input font-mono font-semibold"
                placeholder="0712345678"
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{lang === 'sw' ? 'Barua Pepe (Email)' : 'Email Address'} *</label>
              <input
                required
                type="email"
                className="input"
                placeholder="staff@lucentiasalon.co.tz"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{lang === 'sw' ? 'Idara / Majukumu' : 'Department / Responsibilities'}</label>
              <input
                className="input"
                placeholder="e.g., Hair Styling, Front Desk, Inventory..."
                value={userForm.department}
                onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">
                {lang === 'sw' ? 'Cheo cha Mfanyakazi (Role)' : 'Assigned Employee Role'} *
              </label>
              <select
                required
                className="input font-semibold"
                value={userForm.roleId}
                onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}
              >
                {activeRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">{lang === 'sw' ? 'Hali ya Akaunti' : 'Account Status'} *</label>
              <select
                className="input font-semibold"
                value={userForm.status}
                onChange={(e) => setUserForm({ ...userForm, status: e.target.value as AccountStatus })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
                <option value="locked">Locked</option>
              </select>
            </div>
          </div>

          {/* Allowed Authentication Methods Policy */}
          <div className="rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB] p-4 space-y-2.5">
            <label className="text-xs font-extrabold text-[#111827] block">
              {lang === 'sw'
                ? 'Njia za Kuingia Zinazoruhusiwa kwa Akaunti Hii'
                : 'Allowed Authentication Methods (Step 2 Policy)'}
            </label>
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-[#1F2937]">
                <input
                  type="checkbox"
                  checked={userForm.authMethods.pin}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      authMethods: { ...userForm.authMethods, pin: e.target.checked },
                    })
                  }
                  className="w-4 h-4 rounded border-[#CBD5E1] text-[#6D28D9] focus:ring-[#6D28D9]"
                />
                <span>4-Digit PIN Passcode</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-[#1F2937]">
                <input
                  type="checkbox"
                  checked={userForm.authMethods.password}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      authMethods: { ...userForm.authMethods, password: e.target.checked },
                    })
                  }
                  className="w-4 h-4 rounded border-[#CBD5E1] text-[#6D28D9] focus:ring-[#6D28D9]"
                />
                <span>Account Password Access</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">
                {editingUser
                  ? lang === 'sw'
                    ? 'Weka PIN Mpya ya Tarakimu 4 (Acha wazi kubakiza ya zamani)'
                    : 'Set New 4-Digit PIN (Leave blank to keep existing)'
                  : lang === 'sw'
                    ? 'PIN ya Awali (Acha wazi kutengeneza otomatiki)'
                    : 'Initial 4-Digit PIN (Leave blank to auto-generate)'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                className="input font-bold tracking-widest"
                value={userForm.pin}
                onChange={(e) => setUserForm({ ...userForm, pin: e.target.value.replace(/\D/g, '') })}
              />
            </div>

            {!editingUser && (
              <div>
                <label className="label">
                  {lang === 'sw' ? 'Njia ya Kutuma Taarifa' : 'Onboarding & Credential Method'}
                </label>
                <select
                  className="input font-semibold"
                  value={userForm.onboardingMethod}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      onboardingMethod: e.target.value as 'activation_link' | 'temp_password',
                    })
                  }
                >
                  <option value="activation_link">One-Time Expiring Activation Link (Recommended)</option>
                  <option value="temp_password">Generated Temporary Password &amp; PIN</option>
                </select>
              </div>
            )}
          </div>

          {!editingUser && userForm.onboardingMethod === 'temp_password' && (
            <div>
              <label className="label">
                {lang === 'sw'
                  ? 'Nywila ya Awali (Acha wazi kutengeneza otomatiki)'
                  : 'Initial Temporary Password (Leave blank to auto-generate securely)'}
              </label>
              <input
                type="text"
                className="input"
                placeholder="Auto-generated strong temporary password"
                value={userForm.customPassword}
                onChange={(e) => setUserForm({ ...userForm, customPassword: e.target.value })}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-[#E5E7EB]">
            <button type="button" onClick={() => setShowUserModal(false)} className="btn btn-secondary">
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              <Check size={16} />
              <span>
                {editingUser
                  ? t('save')
                  : lang === 'sw'
                    ? 'Sajili Mfanyakazi & Fungua WhatsApp'
                    : 'Create Staff Account & Share via WhatsApp'}
              </span>
            </button>
          </div>
        </form>
      </Modal>

      {/* =================================================================
          ONE-TIME PIN RESET MODAL (NEVER STORED IN PLAINTEXT)
      ================================================================= */}
      {pinResetContext && (
        <Modal
          open={!!pinResetContext}
          onClose={() => setPinResetContext(null)}
          title={lang === 'sw' ? 'PIN Mpya ya Mfanyakazi' : 'New 4-Digit Staff PIN Generated'}
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#F0FDF4] border border-[#86EFAC] p-4 text-xs text-[#14532D] space-y-1">
              <p className="font-extrabold text-sm">
                {pinResetContext.targetUser.name} ({pinResetContext.targetUser.phone})
              </p>
              <p>
                This 4-digit PIN is shown only once and has been stored as a cryptographic salted hash. Share it securely with the staff member.
              </p>
            </div>
            <div className="rounded-2xl bg-[#F5F3FF] border border-[#DDD6FE] p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-[#6D28D9]">One-Time 4-Digit PIN</p>
              <p className="text-3xl font-mono font-extrabold tracking-[0.35em] text-[#111827] mt-1">
                {pinResetContext.generatedPin}
              </p>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setPinResetContext(null)} className="btn btn-primary">
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* =================================================================
          WHATSAPP SHARING & ONBOARDING CREDENTIALS MODAL
      ================================================================= */}
      {inviteContext && (
        <WhatsAppInviteModal
          targetUser={inviteContext.targetUser}
          secret={inviteContext.secret}
          onClose={() => setInviteContext(null)}
        />
      )}

      {/* =================================================================
          VIEW STAFF ACCOUNT DETAILS MODAL
      ================================================================= */}
      {viewingUser && (
        <Modal
          open={!!viewingUser}
          onClose={() => setViewingUser(null)}
          title={lang === 'sw' ? 'Taarifa Kamili za Mfanyakazi' : 'Staff Account & Security Summary'}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <img
                src={viewingUser.avatar}
                alt={viewingUser.name}
                className="w-16 h-16 rounded-full object-cover ring-2 ring-[#6D28D9]/30"
              />
              <div>
                <h4 className="text-base font-extrabold text-[#111827]">{viewingUser.name}</h4>
                <p className="text-xs font-bold text-[#6D28D9]">{viewingUser.roleTitle}</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {viewingUser.phone} &bull; {viewingUser.email}
                </p>
                {viewingUser.department && (
                  <p className="text-[11px] text-[#475569] mt-0.5">Department: {viewingUser.department}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                <span className="text-[#6B7280] block">Account Status</span>
                <strong className="text-[#111827] uppercase">{viewingUser.status || 'active'}</strong>
              </div>
              <div className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                <span className="text-[#6B7280] block">Authentication Methods</span>
                <strong className="text-[#111827]">
                  {[
                    viewingUser.authMethods?.pin !== false ? 'PIN Passcode' : '',
                    viewingUser.authMethods?.password !== false ? 'Password' : '',
                  ]
                    .filter(Boolean)
                    .join(' + ')}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                <span className="text-[#6B7280] block">Date Added</span>
                <strong className="text-[#111827]">{formatDateTime(viewingUser.created_at)}</strong>
              </div>
              <div className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                <span className="text-[#6B7280] block">Last Login</span>
                <strong className="text-[#111827]">
                  {viewingUser.last_login_at ? formatDateTime(viewingUser.last_login_at) : 'Never'}
                </strong>
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-[#E5E7EB]">
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleRevokeSession(viewingUser)}
                    className="btn btn-secondary text-xs"
                  >
                    Revoke Active Sessions
                  </button>
                  {viewingUser.status === 'locked' && (
                    <button
                      type="button"
                      onClick={() => {
                        handleUnlockAccount(viewingUser);
                        setViewingUser(null);
                      }}
                      className="btn btn-secondary text-xs"
                    >
                      Unlock Account
                    </button>
                  )}
                </div>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    const u = viewingUser;
                    setViewingUser(null);
                    handleTriggerWhatsAppInvite(u, 'activation_link');
                  }}
                  className="btn btn-secondary text-xs"
                >
                  <Share2 size={15} /> Share via WhatsApp
                </button>
                <button type="button" onClick={() => setViewingUser(null)} className="btn btn-primary text-xs">
                  Close
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function WhatsAppInviteModal({
  targetUser,
  secret,
  onClose,
}: {
  targetUser: AuthUser;
  secret: UserOnboardingSecret;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const { notify } = useToast();

  const { message, whatsappUrl } = useMemo(
    () => buildWhatsAppInvitationMessage(targetUser, secret),
    [targetUser, secret],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      notify(lang === 'sw' ? 'Ujumbe umenakiliwa!' : 'Invitation message copied to clipboard!');
    } catch {
      notify('Copied');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={lang === 'sw' ? 'Tuma Taarifa za Kuingia kwa WhatsApp' : 'Share Login Details via WhatsApp'}
      size="lg"
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-[#F0FDF4] border border-[#86EFAC] p-4 flex items-start gap-3">
          <CheckCircle2 size={20} className="text-[#16A34A] shrink-0 mt-0.5" />
          <div className="text-xs text-[#14532D] space-y-1">
            <p className="font-extrabold text-sm">
              {lang === 'sw'
                ? `Akaunti ya ${targetUser.name} iko tayari kutumwa!`
                : `Credentials ready for ${targetUser.name} (${targetUser.roleTitle})`}
            </p>
            <p>
              {secret.method === 'activation_link'
                ? 'A one-time expiring activation link has been generated. This link is shown only once and allows the user to set their own personal password.'
                : 'A one-time temporary password has been generated. It is displayed only now and is stored as a cryptographic hash.'}
            </p>
          </div>
        </div>

        {secret.tempPassword && (
          <div className="rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] px-4 py-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#475569]">One-Time Temporary Password:</span>
            <code className="font-extrabold text-sm text-[#6D28D9] bg-[#F5F3FF] px-2.5 py-1 rounded">
              {secret.tempPassword}
            </code>
          </div>
        )}

        <div>
          <label className="label">{lang === 'sw' ? 'Ujumbe wa WhatsApp' : 'Formatted WhatsApp Message'}</label>
          <textarea
            readOnly
            rows={13}
            className="input font-mono text-xs bg-[#F8FAFC] leading-relaxed"
            value={message}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
          <button type="button" onClick={handleCopy} className="btn btn-secondary">
            <Copy size={16} />
            <span>{lang === 'sw' ? 'Nakili Ujumbe' : 'Copy Message'}</span>
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white px-4 py-2.5 text-sm font-bold shadow-sm transition"
          >
            <Share2 size={16} />
            <span>{lang === 'sw' ? 'Tuma kwa WhatsApp Sasa' : 'Share Login Details via WhatsApp'}</span>
          </a>
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
// PHASE 4: DYNAMIC ROLES & GRANULAR PERMISSIONS MANAGEMENT (RBAC)
// ===========================================================================
function RolesAndPermissionsTab() {
  const { lang, t } = useI18n();
  const { notify } = useToast();
  const {
    roles,
    users,
    createRole,
    updateRole,
    setRolePermission,
    setModuleAllPermissions,
    deleteRole,
    canPerform,
  } = useAuth();

  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id || 'owner');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    badge: 'Custom Role',
    status: 'active' as RoleStatus,
  });
  const [roleError, setRoleError] = useState('');

  // Role deletion / reassignment modal
  const [deletingRole, setDeletingRole] = useState<RoleDefinition | null>(null);
  const [reassignRoleId, setReassignRoleId] = useState<string>('manager');

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleError('');
    setRoleForm({
      name: '',
      description: '',
      badge: 'Custom Role',
      status: 'active',
    });
    setShowRoleModal(true);
  };

  const openEditRole = (role: RoleDefinition) => {
    setEditingRole(role);
    setRoleError('');
    setRoleForm({
      name: role.name,
      description: role.description,
      badge: role.badge,
      status: role.status,
    });
    setShowRoleModal(true);
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    setRoleError('');

    if (editingRole) {
      const res = updateRole(editingRole.id, roleForm);
      if (!res.ok) {
        setRoleError(res.error || 'Could not update role.');
        return;
      }
      notify(lang === 'sw' ? 'Cheo kimesasishwa!' : 'Role updated!');
      setShowRoleModal(false);
    } else {
      const res = createRole(roleForm);
      if (!res.ok || !res.role) {
        setRoleError(res.error || 'Could not create role.');
        return;
      }
      notify(lang === 'sw' ? 'Cheo kipya kimeundwa!' : 'New custom role created!');
      setSelectedRoleId(res.role.id);
      setShowRoleModal(false);
    }
  };

  const handleConfirmDeleteRole = () => {
    if (!deletingRole) return;
    const assignedCount = users.filter((u) => u.role === deletingRole.id).length;
    const res = deleteRole(deletingRole.id, assignedCount > 0 ? reassignRoleId : undefined);
    if (!res.ok) {
      notify(res.error || 'Could not delete role.', 'error');
      return;
    }
    notify(lang === 'sw' ? 'Cheo kimeondolewa.' : 'Role deleted.');
    setDeletingRole(null);
    setSelectedRoleId('owner');
  };

  const allActions: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'export'];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-[#111827] text-base">
            {lang === 'sw'
              ? 'Usimamizi wa Vyeo na Ruhusa za Kina (Granular RBAC)'
              : 'Dynamic Roles & Granular Permission Control'}
          </h3>
          <p className="text-xs text-[#4B5563]">
            {lang === 'sw'
              ? 'Unda vyeo vipya na dhibiti ruhusa za View, Create, Edit, Delete na Export kwa kila moduli'
              : 'Create custom roles and control View, Create, Edit, Delete, and Export permissions per module'}
          </p>
        </div>

        {canPerform('roles', 'create') && (
          <button onClick={openCreateRole} className="btn btn-primary">
            <Plus size={16} />
            <span>{lang === 'sw' ? 'Unda Cheo Kipya' : 'Create New Role'}</span>
          </button>
        )}
      </div>

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {roles.map((r) => {
          const isSelected = r.id === selectedRole?.id;
          const assignedUsersCount = users.filter((u) => u.role === r.id).length;
          const viewableCount = SYSTEM_MODULES.filter((m) => r.granularPermissions?.[m.key]?.view).length;

          return (
            <div
              key={r.id}
              onClick={() => setSelectedRoleId(r.id)}
              className={`panel p-5 flex flex-col justify-between cursor-pointer transition-all ${
                isSelected ? 'ring-2 ring-[#6D28D9] bg-[#FAF8FF]' : 'hover:shadow-md'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isSelected ? 'bg-[#6D28D9] text-white' : 'bg-[#f3edff] text-[#6d28d9]'
                    }`}
                  >
                    {r.id === 'owner' ? <ShieldCheck size={20} /> : <UserCheck size={20} />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="badge bg-[#f3edff] text-[#6d28d9]">{r.badge}</span>
                    {r.status === 'archived' && (
                      <span className="badge bg-[#FEF3C7] text-[#B45309]">Archived</span>
                    )}
                  </div>
                </div>
                <h4 className="font-bold text-ink-900 text-sm">{r.name}</h4>
                <p className="text-xs text-ink-500 mt-1 leading-relaxed line-clamp-2">{r.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#f1edf8] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Assigned Users:</span>
                  <span className="font-bold text-ink-800">{assignedUsersCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Accessible Modules:</span>
                  <span className="font-extrabold text-[#6d28d9]">
                    {viewableCount} / {SYSTEM_MODULES.length}
                  </span>
                </div>

                {canPerform('roles', 'edit') && (
                  <div
                    className="flex items-center justify-end gap-1 pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => openEditRole(r)}
                      className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] font-semibold"
                    >
                      Edit
                    </button>
                    {r.id !== 'owner' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const nextStatus = r.status === 'active' ? 'archived' : 'active';
                            updateRole(r.id, { status: nextStatus });
                            notify(`Role ${nextStatus}`);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#FEF3C7] text-[#B45309] font-semibold"
                        >
                          {r.status === 'active' ? 'Archive' : 'Restore'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingRole(r);
                            const fallback = roles.find((x) => x.id !== r.id && x.status === 'active');
                            if (fallback) setReassignRoleId(fallback.id);
                          }}
                          className="p-1 text-[#DC2626] hover:bg-[#FEE2E2] rounded-lg"
                          title="Delete Role"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Granular Permission Matrix for Selected Role */}
      {selectedRole && (
        <div className="panel overflow-hidden">
          <div className="px-5 py-4 bg-[#160D24] sidebar-dotted text-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Lock size={18} className="text-[#FAE29C]" />
              <div>
                <h3 className="font-extrabold text-sm text-white">
                  {lang === 'sw'
                    ? `Ruhusa za Kina kwa Cheo: ${selectedRole.name}`
                    : `Granular Module Permissions — ${selectedRole.name}`}
                </h3>
                <p className="text-[11px] text-white/75">
                  {lang === 'sw'
                    ? 'Mabadiliko yanahifadhiwa moja kwa moja kwenye database na kutumika papo hapo'
                    : 'Changes persist immediately to the database and enforce across UI routes & API mutations'}
                </p>
              </div>
            </div>

            {/* Role Quick Switcher Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    r.id === selectedRole.id
                      ? 'bg-[#6D28D9] text-[#FAE29C] shadow-xs'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f6fc] text-ink-600 border-b border-[#ece8f5] text-xs uppercase">
                <tr>
                  <th className="text-left font-bold px-5 py-3.5">
                    {lang === 'sw' ? 'Moduli ya Mfumo' : 'System Module'}
                  </th>
                  {allActions.map((act) => (
                    <th key={act} className="text-center font-bold px-3 py-3.5">
                      {act}
                    </th>
                  ))}
                  <th className="text-right font-bold px-5 py-3.5">
                    {lang === 'sw' ? 'Hatua za Haraka' : 'Quick Presets'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1edf8]">
                {SYSTEM_MODULES.map((mod) => {
                  const modPerms = selectedRole.granularPermissions?.[mod.key] || {
                    view: false,
                    create: false,
                    edit: false,
                    delete: false,
                    export: false,
                  };
                  const isProtectedOwnerMod =
                    selectedRole.id === 'owner' &&
                    (mod.key === 'roles' || mod.key === 'users' || mod.key === 'settings');

                  return (
                    <tr key={mod.key} className="hover:bg-[#faf8fe]">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-[#111827]">{lang === 'sw' ? mod.labelSw : mod.label}</p>
                        <p className="text-[11px] text-[#6B7280]">Key: {mod.key}</p>
                      </td>

                      {allActions.map((action) => {
                        const supported = mod.supportedActions.includes(action);
                        if (!supported) {
                          return (
                            <td key={action} className="px-3 py-3.5 text-center text-ink-300 text-xs">
                              —
                            </td>
                          );
                        }
                        const checked = !!modPerms[action];
                        return (
                          <td key={action} className="px-3 py-3.5 text-center">
                            <input
                              type="checkbox"
                              disabled={isProtectedOwnerMod || !canPerform('roles', 'edit')}
                              checked={checked}
                              onChange={(e) => {
                                const res = setRolePermission(
                                  selectedRole.id,
                                  mod.key,
                                  action,
                                  e.target.checked,
                                );
                                if (!res.ok) notify(res.error || 'Error', 'error');
                              }}
                              className="w-4 h-4 rounded border-[#CBD5E1] text-[#6D28D9] focus:ring-[#6D28D9] cursor-pointer disabled:opacity-50"
                            />
                          </td>
                        );
                      })}

                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {!isProtectedOwnerMod && canPerform('roles', 'edit') && (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setModuleAllPermissions(selectedRole.id, mod.key, true)}
                              className="px-2.5 py-1 rounded-lg bg-[#F5F3FF] text-[#6D28D9] hover:bg-[#EDE9FE] text-xs font-bold"
                            >
                              Full Access
                            </button>
                            <button
                              type="button"
                              onClick={() => setModuleAllPermissions(selectedRole.id, mod.key, false)}
                              className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] text-xs font-semibold"
                            >
                              None
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Role Modal */}
      <Modal
        open={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        title={
          editingRole
            ? lang === 'sw'
              ? `Hariri Cheo: ${editingRole.name}`
              : `Edit Role: ${editingRole.name}`
            : lang === 'sw'
              ? 'Unda Cheo Kipya (Create Custom Role)'
              : 'Create New Custom Role'
        }
      >
        <form onSubmit={handleSaveRole} className="space-y-4">
          {roleError && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-2.5 text-xs font-semibold text-[#DC2626]">
              {roleError}
            </div>
          )}

          <div>
            <label className="label">{lang === 'sw' ? 'Jina la Cheo' : 'Role Name'} *</label>
            <input
              required
              className="input"
              placeholder="e.g., Inventory Manager, Senior Receptionist..."
              value={roleForm.name}
              onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
            />
          </div>

          <div>
            <label className="label">{lang === 'sw' ? 'Maelezo ya Cheo' : 'Role Description'} *</label>
            <textarea
              rows={3}
              required
              className="input"
              placeholder="Describe the responsibilities and scope of this role..."
              value={roleForm.description}
              onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{lang === 'sw' ? 'Lebo Fupi (Badge)' : 'Role Badge Label'}</label>
              <input
                className="input"
                placeholder="Operations, Front Desk..."
                value={roleForm.badge}
                onChange={(e) => setRoleForm({ ...roleForm, badge: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{lang === 'sw' ? 'Hali ya Cheo' : 'Role Status'}</label>
              <select
                className="input"
                value={roleForm.status}
                onChange={(e) => setRoleForm({ ...roleForm, status: e.target.value as RoleStatus })}
              >
                <option value="active">Active (Available in User Dropdown)</option>
                <option value="archived">Archived (Hidden from New Assignments)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowRoleModal(false)} className="btn btn-secondary">
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              <Check size={16} />
              <span>{t('save')}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Safe Role Deletion & User Reassignment Modal */}
      {deletingRole && (
        <Modal
          open={!!deletingRole}
          onClose={() => setDeletingRole(null)}
          title={lang === 'sw' ? `Ondoa Cheo: ${deletingRole.name}` : `Delete Role: ${deletingRole.name}`}
        >
          <div className="space-y-4">
            {users.filter((u) => u.role === deletingRole.id).length > 0 ? (
              <>
                <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-4 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-[#D97706] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#92400E]">
                    <p className="font-extrabold">
                      {users.filter((u) => u.role === deletingRole.id).length} user(s) are currently assigned to &ldquo;
                      {deletingRole.name}&rdquo;
                    </p>
                    <p className="mt-1">
                      To protect account integrity, select an active replacement role below to reassign those users
                      before removing this role.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="label">Reassign Existing Users To:</label>
                  <select
                    className="input font-bold"
                    value={reassignRoleId}
                    onChange={(e) => setReassignRoleId(e.target.value)}
                  >
                    {roles
                      .filter((r) => r.id !== deletingRole.id && r.status === 'active')
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#4B5563]">
                No users are currently assigned to <strong>{deletingRole.name}</strong>. You can safely delete this role.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDeletingRole(null)} className="btn btn-secondary">
                {t('cancel')}
              </button>
              <button type="button" onClick={handleConfirmDeleteRole} className="btn btn-danger">
                <Trash2 size={15} />
                <span>Confirm &amp; Delete Role</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===========================================================================
// PHASE 6: CATEGORY MANAGEMENT WITH SAFE DELETION, ARCHIVING & REASSIGNMENT
// ===========================================================================
function CategoriesManagementTab() {
  const { t, lang } = useI18n();
  const { notify } = useToast();
  const { logAuditEvent, canPerform } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | CategoryType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');

  // Create / Edit Modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({
    name: '',
    type: 'product' as CategoryType,
    description: '',
    status: 'active' as 'active' | 'archived',
  });

  // Safe Delete / Reassign Modal
  const [removingCat, setRemovingCat] = useState<{ cat: Category; linkedCount: number } | null>(null);
  const [reassignCatId, setReassignCatId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [catRes, prdRes, svcRes, expRes] = await Promise.all([
      supabase.from('categories').select('*').order('type').order('name'),
      supabase.from('products').select('*'),
      supabase.from('services').select('*'),
      supabase.from('expenses').select('*'),
    ]);
    setCategories((catRes.data || []) as Category[]);
    setProducts((prdRes.data || []) as Product[]);
    setServices((svcRes.data || []) as Service[]);
    setExpenses((expRes.data || []) as Expense[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getLinkedCount = useCallback(
    (cat: Category): number => {
      if (cat.type === 'product') return products.filter((p) => p.category_id === cat.id).length;
      if (cat.type === 'service') return services.filter((s) => s.category_id === cat.id).length;
      if (cat.type === 'expense') return expenses.filter((e) => e.category_id === cat.id).length;
      return 0;
    },
    [products, services, expenses],
  );

  const openCreateCat = () => {
    setEditingCat(null);
    setCatForm({
      name: '',
      type: 'product',
      description: '',
      status: 'active',
    });
    setShowCatModal(true);
  };

  const openEditCat = (cat: Category) => {
    setEditingCat(cat);
    setCatForm({
      name: cat.name,
      type: cat.type,
      description: cat.description || '',
      status: cat.status || 'active',
    });
    setShowCatModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catForm.name.trim()) {
      notify(t('error'), 'error');
      return;
    }

    const payload = {
      name: catForm.name.trim(),
      type: catForm.type,
      description: catForm.description.trim() || null,
      status: catForm.status,
    };

    if (editingCat) {
      const { error } = await supabase.from('categories').update(payload).eq('id', editingCat.id);
      if (error) {
        notify(error.message || t('error'), 'error');
        return;
      }
      logAuditEvent({
        action: 'Updated Category',
        category: 'category',
        targetName: payload.name,
        details: `Type: ${payload.type}, Status: ${payload.status}`,
      });
    } else {
      const { error } = await supabase.from('categories').insert(payload);
      if (error) {
        notify(error.message || t('error'), 'error');
        return;
      }
      logAuditEvent({
        action: 'Created Category',
        category: 'category',
        targetName: payload.name,
        details: `Created ${payload.type} category "${payload.name}"`,
      });
    }

    notify(t('saved'));
    setShowCatModal(false);
    load();
  };

  const handleToggleArchive = async (cat: Category) => {
    const nextStatus = (cat.status || 'active') === 'active' ? 'archived' : 'active';
    const { error } = await supabase.from('categories').update({ status: nextStatus }).eq('id', cat.id);
    if (error) {
      notify(error.message || t('error'), 'error');
      return;
    }
    logAuditEvent({
      action: nextStatus === 'archived' ? 'Archived Category' : 'Restored Category',
      category: 'category',
      targetName: cat.name,
      details: `Set status to "${nextStatus}" for ${cat.type} category "${cat.name}".`,
    });
    notify(t('saved'));
    load();
  };

  const initiateRemoveCategory = (cat: Category) => {
    const linkedCount = getLinkedCount(cat);
    const sameTypeActives = categories.filter(
      (c) => c.type === cat.type && c.id !== cat.id && (c.status || 'active') === 'active',
    );
    setReassignCatId(sameTypeActives[0]?.id || '');
    setRemovingCat({ cat, linkedCount });
  };

  const handleConfirmDeleteOrReassign = async (mode: 'archive' | 'reassign_and_delete' | 'delete_safe') => {
    if (!removingCat) return;
    const { cat } = removingCat;

    if (mode === 'archive') {
      await handleToggleArchive(cat);
      setRemovingCat(null);
      return;
    }

    if (mode === 'reassign_and_delete') {
      if (!reassignCatId) {
        notify('Please select a target category to reassign existing records.', 'error');
        return;
      }
      if (cat.type === 'product') {
        const linked = products.filter((p) => p.category_id === cat.id);
        for (const p of linked) {
          await supabase.from('products').update({ category_id: reassignCatId }).eq('id', p.id);
        }
      } else if (cat.type === 'service') {
        const linked = services.filter((s) => s.category_id === cat.id);
        for (const s of linked) {
          await supabase.from('services').update({ category_id: reassignCatId }).eq('id', s.id);
        }
      } else if (cat.type === 'expense') {
        const linked = expenses.filter((e) => e.category_id === cat.id);
        for (const e of linked) {
          await supabase.from('expenses').update({ category_id: reassignCatId }).eq('id', e.id);
        }
      }
    }

    const { error } = await supabase.from('categories').delete().eq('id', cat.id);
    if (error) {
      notify(error.message || t('error'), 'error');
      return;
    }

    logAuditEvent({
      action: 'Deleted Category',
      category: 'category',
      targetName: cat.name,
      details:
        mode === 'reassign_and_delete'
          ? `Reassigned ${removingCat.linkedCount} record(s) and deleted category "${cat.name}".`
          : `Deleted unused ${cat.type} category "${cat.name}".`,
    });

    notify(t('deleted'));
    setRemovingCat(null);
    load();
  };

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const st = c.status || 'active';
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          c.name.toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          c.type.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [categories, typeFilter, statusFilter, search]);

  const typeBadge = (type: CategoryType) => {
    if (type === 'product') return <span className="badge bg-[#F5F3FF] text-[#6D28D9]">Product Category</span>;
    if (type === 'service') return <span className="badge bg-[#EDFCF2] text-[#098F50]">Service Category</span>;
    return <span className="badge bg-[#FFF1E6] text-[#EA6C0A]">Expense Category</span>;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-[#111827] text-base">
            {lang === 'sw' ? 'Usimamizi wa Makundi (Categories)' : 'Dynamic Category Management'}
          </h3>
          <p className="text-xs text-[#4B5563]">
            {lang === 'sw'
              ? 'Unda, hariri, hifadhi kwenye kumbukumbu (Archive) au futa makundi ya Bidhaa, Huduma na Matumizi kwa usalama'
              : 'Manage Product, Service, and Expense categories with safe archiving and historical record protection'}
          </p>
        </div>

        {canPerform('categories', 'create') && (
          <button onClick={openCreateCat} className="btn btn-primary">
            <Plus size={16} />
            <span>{lang === 'sw' ? 'Unda Kundi Jipya' : 'Create Category'}</span>
          </button>
        )}
      </div>

      {/* Search + Category Type Filter + Status Filter */}
      <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            className="input pl-10"
            placeholder={lang === 'sw' ? 'Tafuta kundi...' : 'Search categories by name or description...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <select
            className="input w-auto"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | CategoryType)}
          >
            <option value="all">{lang === 'sw' ? 'Aina Zote' : 'All Category Types'}</option>
            <option value="product">Product Categories</option>
            <option value="service">Service Categories</option>
            <option value="expense">Expense Categories</option>
          </select>

          <select
            className="input w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'archived')}
          >
            <option value="all">{lang === 'sw' ? 'Hali Zote' : 'All Statuses'}</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Categories Table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f6fc] text-ink-600 border-b border-[#ece8f5] text-xs uppercase">
              <tr>
                <th className="text-left font-bold px-5 py-3.5">{lang === 'sw' ? 'Jina la Kundi' : 'Category Name'}</th>
                <th className="text-left font-bold px-4 py-3.5">{lang === 'sw' ? 'Aina' : 'Type'}</th>
                <th className="text-left font-bold px-4 py-3.5">{lang === 'sw' ? 'Maelezo' : 'Description'}</th>
                <th className="text-center font-bold px-4 py-3.5">{lang === 'sw' ? 'Rekodi Zilizounganishwa' : 'Linked Records'}</th>
                <th className="text-center font-bold px-4 py-3.5">{lang === 'sw' ? 'Hali' : 'Status'}</th>
                <th className="text-right font-bold px-5 py-3.5">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1edf8]">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-ink-400">
                    {t('noData')}
                  </td>
                </tr>
              ) : (
                filteredCategories.map((c) => {
                  const linked = getLinkedCount(c);
                  const isArchived = (c.status || 'active') === 'archived';
                  return (
                    <tr key={c.id} className="hover:bg-[#faf8fe]">
                      <td className="px-5 py-3.5 font-bold text-[#111827]">{c.name}</td>
                      <td className="px-4 py-3.5">{typeBadge(c.type)}</td>
                      <td className="px-4 py-3.5 text-xs text-[#4B5563] max-w-xs">
                        {c.description || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold text-[#334155]">{linked}</td>
                      <td className="px-4 py-3.5 text-center">
                        {isArchived ? (
                          <span className="badge bg-[#FEF3C7] text-[#B45309]">Archived</span>
                        ) : (
                          <span className="badge bg-[#DCFCE7] text-[#15803D]">Active</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {canPerform('categories', 'edit') && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditCat(c)}
                                className="p-1.5 text-ink-400 hover:text-[#6D28D9] hover:bg-[#F5F3FF] rounded-lg"
                                title="Edit Category"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleArchive(c)}
                                className="p-1.5 text-ink-400 hover:text-[#D97706] hover:bg-[#FEF3C7] rounded-lg"
                                title={isArchived ? 'Restore Category' : 'Archive Category'}
                              >
                                <Archive size={16} />
                              </button>
                            </>
                          )}
                          {canPerform('categories', 'delete') && (
                            <button
                              type="button"
                              onClick={() => initiateRemoveCategory(c)}
                              className="p-1.5 text-ink-400 hover:text-[#DC2626] hover:bg-[#FEE2E2] rounded-lg"
                              title="Remove Category"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Category Modal */}
      <Modal
        open={showCatModal}
        onClose={() => setShowCatModal(false)}
        title={
          editingCat
            ? lang === 'sw'
              ? `Hariri Kundi: ${editingCat.name}`
              : `Edit Category: ${editingCat.name}`
            : lang === 'sw'
              ? 'Unda Kundi Jipya'
              : 'Create New Category'
        }
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <div>
            <label className="label">{lang === 'sw' ? 'Jina la Kundi' : 'Category Name'} *</label>
            <input
              required
              className="input"
              placeholder="e.g., Hair Extensions, Bridal Services, Utilities..."
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{lang === 'sw' ? 'Aina ya Kundi' : 'Category Type'} *</label>
              <select
                className="input font-semibold"
                value={catForm.type}
                onChange={(e) => setCatForm({ ...catForm, type: e.target.value as CategoryType })}
              >
                <option value="product">Product Category (Inventory)</option>
                <option value="service">Service Category (Salon Services)</option>
                <option value="expense">Expense Category (Operating Costs)</option>
              </select>
            </div>
            <div>
              <label className="label">{lang === 'sw' ? 'Hali' : 'Status'}</label>
              <select
                className="input font-semibold"
                value={catForm.status}
                onChange={(e) => setCatForm({ ...catForm, status: e.target.value as 'active' | 'archived' })}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">{lang === 'sw' ? 'Maelezo' : 'Description'}</label>
            <textarea
              rows={3}
              className="input"
              placeholder="Optional description of items belonging to this category..."
              value={catForm.description}
              onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCatModal(false)} className="btn btn-secondary">
              {t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              <Check size={16} />
              <span>{t('save')}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Safe Category Deletion / Archiving / Reassignment Modal */}
      {removingCat && (
        <Modal
          open={!!removingCat}
          onClose={() => setRemovingCat(null)}
          title={
            lang === 'sw'
              ? `Ufutaji Salama wa Kundi: ${removingCat.cat.name}`
              : `Safe Category Removal: ${removingCat.cat.name}`
          }
        >
          <div className="space-y-4">
            {removingCat.linkedCount > 0 ? (
              <>
                <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-4 flex items-start gap-3">
                  <AlertTriangle size={19} className="text-[#D97706] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#92400E] space-y-1">
                    <p className="font-extrabold">
                      This category is linked to {removingCat.linkedCount} existing {removingCat.cat.type} record(s).
                    </p>
                    <p>
                      To protect historical records and financial reports, you can either <strong>Archive</strong> this
                      category (hiding it from new forms while keeping past records intact) or{' '}
                      <strong>Reassign</strong> its records to another category before deleting.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="label">Reassign Existing {removingCat.linkedCount} Record(s) To:</label>
                  <select
                    className="input font-bold"
                    value={reassignCatId}
                    onChange={(e) => setReassignCatId(e.target.value)}
                  >
                    <option value="">— Select Replacement Category —</option>
                    {categories
                      .filter(
                        (c) =>
                          c.type === removingCat.cat.type &&
                          c.id !== removingCat.cat.id &&
                          (c.status || 'active') === 'active',
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setRemovingCat(null)} className="btn btn-secondary">
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmDeleteOrReassign('archive')}
                    className="px-4 py-2 rounded-xl bg-[#FEF3C7] text-[#B45309] font-bold text-xs hover:bg-[#FDE68A]"
                  >
                    Archive Category Instead
                  </button>
                  <button
                    type="button"
                    disabled={!reassignCatId}
                    onClick={() => handleConfirmDeleteOrReassign('reassign_and_delete')}
                    className="btn btn-danger disabled:opacity-50"
                  >
                    Reassign &amp; Delete Permanently
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-[#4B5563]">
                  <strong>{removingCat.cat.name}</strong> has 0 linked records and can be safely deleted without
                  affecting any historical transactions.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setRemovingCat(null)} className="btn btn-secondary">
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmDeleteOrReassign('delete_safe')}
                    className="btn btn-danger"
                  >
                    <Trash2 size={15} /> Delete Permanently
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===========================================================================
// PHASE 7: GENERAL SALON SETUP (SERVICES, HAIRSTYLES, STAFF & SUPPLIERS)
// ===========================================================================
function GeneralSalonSetupTab() {
  return (
    <div className="space-y-8">
      <ServicesSection />
      <StaffSection />
      <SuppliersSection />
    </div>
  );
}

function ServicesSection() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [hairstyles, setHairstyles] = useState<Hairstyle[]>([]);
  const [serviceCats, setServiceCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showHsForm, setShowHsForm] = useState(false);
  const [form, setForm] = useState({ name: '', default_price: 0, category_id: '' });
  const [hsForm, setHsForm] = useState({ service_id: '', name: '', default_price: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const [svcRes, hsRes, catRes] = await Promise.all([
      supabase.from('services').select('*').order('name'),
      supabase.from('hairstyles').select('*').order('name'),
      supabase.from('categories').select('*').eq('type', 'service'),
    ]);
    setServices((svcRes.data || []) as Service[]);
    setHairstyles((hsRes.data || []) as Hairstyle[]);
    setServiceCats(((catRes.data || []) as Category[]).filter((c) => (c.status || 'active') === 'active'));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.name) {
      notify(t('error'), 'error');
      return;
    }
    const payload = {
      name: form.name,
      default_price: form.default_price,
      category_id: form.category_id || null,
    };
    if (editing) {
      const { error } = await supabase.from('services').update(payload).eq('id', editing.id);
      if (error) {
        notify(error.message || t('error'), 'error');
        return;
      }
    } else {
      const { error } = await supabase.from('services').insert(payload);
      if (error) {
        notify(error.message || t('error'), 'error');
        return;
      }
    }
    notify(t('saved'));
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', default_price: 0, category_id: '' });
    load();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) {
      notify(error.message || t('error'), 'error');
      return;
    }
    notify(t('deleted'));
    load();
  };

  const saveHs = async () => {
    if (!hsForm.name || !hsForm.service_id) {
      notify(t('error'), 'error');
      return;
    }
    const { error } = await supabase.from('hairstyles').insert({
      service_id: hsForm.service_id,
      name: hsForm.name,
      default_price: hsForm.default_price,
    });
    if (error) {
      notify(error.message || t('error'), 'error');
      return;
    }
    notify(t('saved'));
    setShowHsForm(false);
    setHsForm({ service_id: '', name: '', default_price: 0 });
    load();
  };

  const delHs = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('hairstyles').delete().eq('id', id);
    if (error) {
      notify(error.message || t('error'), 'error');
      return;
    }
    notify(t('deleted'));
    load();
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-ink-900">{t('manageServices')}</h3>
        <button
          onClick={() => {
            setEditing(null);
            setForm({ name: '', default_price: 0, category_id: '' });
            setShowForm(true);
          }}
          className="btn btn-primary"
        >
          <Plus size={16} /> {t('add')}
        </button>
      </div>

      {showForm && (
        <div className="panel p-4 flex flex-wrap items-center gap-3">
          <input
            className="input flex-1 min-w-44"
            placeholder={t('name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className="input w-auto"
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          >
            <option value="">— Service Category —</option>
            {serviceCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            className="input w-40"
            placeholder={t('defaultPrice')}
            value={form.default_price}
            onChange={(e) => setForm({ ...form, default_price: parseFloat(e.target.value) || 0 })}
          />
          <button onClick={save} className="btn btn-primary">
            <Check size={16} /> {t('save')}
          </button>
          <button onClick={() => setShowForm(false)} className="btn btn-secondary">
            {t('cancel')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((svc) => (
          <div key={svc.id} className="panel p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#f3edff] text-[#6d28d9] flex items-center justify-center">
                  <Scissors size={18} />
                </div>
                <div>
                  <p className="font-bold text-ink-900">{svc.name}</p>
                  <p className="text-xs font-medium text-[#6d28d9]">{formatCurrency(svc.default_price)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditing(svc);
                    setForm({
                      name: svc.name,
                      default_price: svc.default_price,
                      category_id: svc.category_id || '',
                    });
                    setShowForm(true);
                  }}
                  className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={() => del(svc.id)}
                  className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              {hairstyles
                .filter((h) => h.service_id === svc.id)
                .map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded-xl bg-[#faf8fe] border border-[#f1edf8] px-3.5 py-2"
                  >
                    <span className="text-xs font-semibold text-ink-800">{h.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink-600">{formatCurrency(h.default_price)}</span>
                      <button onClick={() => delHs(h.id)} className="p-1 text-ink-400 hover:text-error-600">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              <button
                onClick={() => {
                  setHsForm({ service_id: svc.id, name: '', default_price: svc.default_price });
                  setShowHsForm(true);
                }}
                className="pt-1 text-xs text-[#6d28d9] hover:text-[#5b21b6] font-semibold flex items-center gap-1"
              >
                <Plus size={13} /> {t('hairstyle')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showHsForm && (
        <Modal open={showHsForm} onClose={() => setShowHsForm(false)} title={t('hairstyle')}>
          <div className="space-y-3">
            <input
              className="input"
              placeholder={t('name')}
              value={hsForm.name}
              onChange={(e) => setHsForm({ ...hsForm, name: e.target.value })}
            />
            <input
              type="number"
              min={0}
              className="input"
              placeholder={t('defaultPrice')}
              value={hsForm.default_price}
              onChange={(e) => setHsForm({ ...hsForm, default_price: parseFloat(e.target.value) || 0 })}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowHsForm(false)} className="btn btn-secondary">
                {t('cancel')}
              </button>
              <button onClick={saveHs} className="btn btn-primary">
                {t('save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StaffSection() {
  const { t } = useI18n();
  const { notify } = useToast();
  const { activeRoles } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', role: '', active: true });

  const load = useCallback(async () => {
    const { data } = await supabase.from('staff').select('*').order('name');
    setStaff((data || []) as Staff[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.name) return;
    const payload = {
      name: form.name,
      phone: form.phone || null,
      role: form.role || null,
      active: form.active,
    };
    if (editing) {
      await supabase.from('staff').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('staff').insert(payload);
    }
    notify(t('saved'));
    setShowForm(false);
    setEditing(null);
    load();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    await supabase.from('staff').delete().eq('id', id);
    notify(t('deleted'));
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-ink-900">{t('manageStaff')}</h3>
        <button
          onClick={() => {
            setEditing(null);
            setForm({ name: '', phone: '', role: activeRoles[0]?.name || 'Stylist', active: true });
            setShowForm(true);
          }}
          className="btn btn-primary"
        >
          <Plus size={16} /> {t('add')}
        </button>
      </div>

      {showForm && (
        <div className="panel p-4 flex flex-wrap items-center gap-3">
          <input
            className="input flex-1 min-w-44"
            placeholder={t('name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input flex-1 min-w-40"
            placeholder={t('phone')}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <select
            className="input w-auto"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {activeRoles.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <button onClick={save} className="btn btn-primary">
            <Check size={16} /> {t('save')}
          </button>
          <button onClick={() => setShowForm(false)} className="btn btn-secondary">
            {t('cancel')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {staff.map((s) => (
          <div key={s.id} className="panel p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#f3edff] text-[#6d28d9] flex items-center justify-center font-bold">
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-ink-900">{s.name}</p>
                  <p className="text-xs font-medium text-[#6d28d9]">{s.role || 'Stylist'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditing(s);
                    setForm({ name: s.name, phone: s.phone || '', role: s.role || '', active: s.active ?? true });
                    setShowForm(true);
                  }}
                  className="p-1.5 text-ink-400 hover:text-primary-600 rounded-lg"
                >
                  <Edit3 size={16} />
                </button>
                <button onClick={() => del(s.id)} className="p-1.5 text-ink-400 hover:text-error-600 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#f1edf8] flex items-center justify-between text-xs">
              <span className="text-ink-500">{s.phone || '—'}</span>
              <span className="badge bg-success-100 text-success-700">{t('active')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SuppliersSection() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', location: '' });

  const load = useCallback(async () => {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers((data || []) as Supplier[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.name) return;
    if (editing) {
      await supabase.from('suppliers').update(form).eq('id', editing.id);
    } else {
      await supabase.from('suppliers').insert(form);
    }
    notify(t('saved'));
    setShowForm(false);
    setEditing(null);
    load();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    await supabase.from('suppliers').delete().eq('id', id);
    notify(t('deleted'));
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-ink-900">{t('manageSuppliers')}</h3>
        <button
          onClick={() => {
            setEditing(null);
            setForm({ name: '', phone: '', location: '' });
            setShowForm(true);
          }}
          className="btn btn-primary"
        >
          <Plus size={16} /> {t('add')}
        </button>
      </div>

      {showForm && (
        <div className="panel p-4 flex flex-wrap items-center gap-3">
          <input
            className="input flex-1 min-w-44"
            placeholder={t('name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input flex-1 min-w-40"
            placeholder={t('phone')}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            className="input flex-1 min-w-40"
            placeholder={t('location')}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <button onClick={save} className="btn btn-primary">
            <Check size={16} /> {t('save')}
          </button>
          <button onClick={() => setShowForm(false)} className="btn btn-secondary">
            {t('cancel')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map((s) => (
          <div key={s.id} className="panel p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#f3edff] text-[#6d28d9] flex items-center justify-center">
                  <Truck size={20} />
                </div>
                <div>
                  <p className="font-bold text-ink-900">{s.name}</p>
                  <p className="text-xs text-ink-500">{s.location || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditing(s);
                    setForm({ name: s.name, phone: s.phone || '', location: s.location || '' });
                    setShowForm(true);
                  }}
                  className="p-1.5 text-ink-400 hover:text-primary-600 rounded-lg"
                >
                  <Edit3 size={16} />
                </button>
                <button onClick={() => del(s.id)} className="p-1.5 text-ink-400 hover:text-error-600 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <p className="mt-3 pt-3 border-t border-[#f1edf8] text-xs text-ink-500">{s.phone || '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// PHASE 8: SECURITY & ADMINISTRATIVE AUDIT TRAIL
// ===========================================================================
function SecurityAuditTab() {
  const { lang } = useI18n();
  const { auditLogs } = useAuth();
  const [catFilter, setCatFilter] = useState('all');

  const filteredLogs = auditLogs.filter((l) => catFilter === 'all' || l.category === catFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-[#111827] text-base">
            {lang === 'sw' ? 'Kumbukumbu za Ukaguzi na Usalama (Audit Trail)' : 'Administrative Security & Audit Trail'}
          </h3>
          <p className="text-xs text-[#4B5563]">
            {lang === 'sw'
              ? 'Kila tukio muhimu (watumiaji, vyeo, ruhusa, makundi na nywila) linarekodiwa bila kuonyesha nywila za siri'
              : 'Every administrative action is logged with zero plaintext passwords or authentication tokens'}
          </p>
        </div>

        <select className="input w-auto" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All Event Categories</option>
          <option value="user">User Management</option>
          <option value="role">Role Definitions</option>
          <option value="permission">Permission Changes</option>
          <option value="category">Category Changes</option>
          <option value="profile">Profile Updates</option>
          <option value="security">Security &amp; Auth</option>
        </select>
      </div>

      <div className="panel overflow-hidden">
        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={<FileText size={30} />}
            title={lang === 'sw' ? 'Hakuna kumbukumbu bado' : 'No administrative audit events recorded yet'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#f8f6fc] text-ink-600 border-b border-[#ece8f5] uppercase">
                <tr>
                  <th className="text-left font-bold px-4 py-3">Timestamp</th>
                  <th className="text-left font-bold px-4 py-3">Actor</th>
                  <th className="text-left font-bold px-4 py-3">Action</th>
                  <th className="text-left font-bold px-4 py-3">Target</th>
                  <th className="text-left font-bold px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1edf8]">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#faf8fe]">
                    <td className="px-4 py-3 text-[#64748B] whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-[#111827]">{log.actorName}</span>
                      <span className="block text-[10px] text-[#6D28D9]">{log.actorRole}</span>
                    </td>
                    <td className="px-4 py-3 font-extrabold text-[#1E293B]">{log.action}</td>
                    <td className="px-4 py-3 font-semibold text-[#334155]">{log.targetName}</td>
                    <td className="px-4 py-3 text-[#475569]">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
