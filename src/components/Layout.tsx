import { useEffect, useId, useState } from 'react';
import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import {
  Home,
  Package,
  ShoppingCart,
  Wallet,
  Scissors,
  BarChart3,
  Settings as SettingsIcon,
  Users,
  User,
  LogOut,
  Menu,
  X,
  Languages,
  Bell,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
} from 'lucide-react';
import { useI18n, type Lang } from '@/lib/i18n';
import { useAuth, type AuthUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';

export interface LayoutOutletContext {
  headerSlot: HTMLElement | null;
}

type NavItem = {
  to: string;
  icon: typeof Home;
  key: string;
  labelEn?: string;
  labelSw?: string;
  perm: string;
  children?: { to: string; icon: typeof Home; key: string; perm: string }[];
};

const navItems: NavItem[] = [
  { to: '/', icon: Home, key: 'dashboard', perm: 'dashboard' },
  {
    to: '/inventory',
    icon: Package,
    key: 'productsInventory',
    perm: 'inventory',
    children: [
      { to: '/inventory', icon: Package, key: 'inventory', perm: 'inventory' },
      { to: '/purchases', icon: ShoppingCart, key: 'purchases', perm: 'purchases' },
    ],
  },
  { to: '/expenses', icon: Wallet, key: 'expenses', perm: 'expenses' },
  { to: '/sales', icon: Scissors, key: 'sales', perm: 'sales' },
  { to: '/reports', icon: BarChart3, key: 'reports', perm: 'reports' },
  {
    to: '/settings?tab=users',
    icon: Users,
    key: 'staffManagement',
    labelEn: 'Staff Management',
    labelSw: 'Usimamizi wa Wafanyakazi',
    perm: 'users',
  },
  { to: '/settings', icon: SettingsIcon, key: 'settings', perm: 'settings' },
];

const pageTitles: Record<string, string> = {
  '/': 'dashboard',
  '/inventory': 'inventory',
  '/purchases': 'purchases',
  '/expenses': 'expenses',
  '/sales': 'sales',
  '/reports': 'reports',
  '/settings': 'settings',
  '/profile': 'settings',
};

export default function Layout() {
  const { lang, setLang, t } = useI18n();
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  const toggleLang = () => {
    const next: Lang = lang === 'sw' ? 'en' : 'sw';
    setLang(next);
  };

  const closeMobile = () => setMobileOpen(false);

  const handleLogout = () => {
    setAdminMenuOpen(false);
    closeMobile();
    logout();
    navigate('/login');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('products').select('*');
      if (cancelled) return;
      const products = (data || []) as Product[];
      setLowStockCount(products.filter((p) => p.current_stock <= p.low_stock_threshold).length);
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const isDashboard = location.pathname === '/';
  const titleKey = pageTitles[location.pathname] || 'dashboard';
  const pageTitle = location.pathname === '/profile' ? (lang === 'sw' ? 'Wasifu' : 'Profile') : t(titleKey);
  const displayName = user?.role === 'owner' ? 'Admin' : user?.name?.split(' ')[0] || 'Admin';
  const moreActive = ['/purchases', '/reports', '/settings', '/profile'].includes(location.pathname);

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#1F2937] flex flex-col lg:flex-row">
      {/* =====================================================================
          DESKTOP SIDEBAR (lg+)
      ===================================================================== */}
      {!desktopCollapsed && (
        <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 z-30 select-none border-r border-[#1f1333] bg-[#171021]">
          <SidebarContent
            user={user}
            onNavigate={closeMobile}
            onLogout={handleLogout}
            hasPermission={hasPermission}
            t={t}
            lang={lang}
          />
        </aside>
      )}

      {/* =====================================================================
          MOBILE NAVIGATION DRAWER / SHEET (< lg)
      ===================================================================== */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={closeMobile} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[84vw] flex flex-col animate-fade-in shadow-2xl">
            <button
              onClick={closeMobile}
              className="absolute top-3.5 right-3.5 z-20 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            <SidebarContent
              isMobile
              user={user}
              onNavigate={closeMobile}
              onLogout={handleLogout}
              hasPermission={hasPermission}
              t={t}
              lang={lang}
            />
          </aside>
        </div>
      )}

      {/* =====================================================================
          MAIN CONTENT WRAPPER
      ===================================================================== */}
      <div className={`flex-1 ${desktopCollapsed ? 'lg:ml-0' : 'lg:ml-64'} min-w-0 flex flex-col bg-[#FFFFFF] transition-all duration-200`}>
        {/* -----------------------------------------------------------------
            DEDICATED MOBILE TOP APP BAR (< lg)
            Dark navy/purple (#160D24) dotted header with golden brand & title
        ----------------------------------------------------------------- */}
        <header className="lg:hidden sticky top-0 z-30 sidebar-dotted text-white px-4 pt-3 pb-3.5 border-b border-white/10 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => setMobileOpen(true)}
                className="p-2 -ml-1 rounded-xl bg-white/10 border border-white/15 text-white active:scale-95 transition"
                aria-label="Open menu"
              >
                <Menu size={19} />
              </button>
              <LucentiaLogo className="w-9 h-9 shrink-0" />
              <div className="min-w-0">
                <p className="font-display text-sm font-bold tracking-[0.12em] text-[#FAE29C] leading-none">
                  LUCENTIA
                </p>
                <p className="text-xs font-semibold text-white truncate mt-0.5">{pageTitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleLang}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/15 px-2.5 py-1.5 text-[11px] font-bold text-white"
              >
                <Languages size={13} className="text-[#FAE29C]" />
                <span>{lang === 'sw' ? 'EN' : 'SW'}</span>
              </button>

              <Link
                to="/inventory"
                className="relative p-2 rounded-full bg-white/10 border border-white/15 text-white"
                aria-label="Notifications"
              >
                <Bell size={16} />
                {lowStockCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center">
                    {lowStockCount}
                  </span>
                )}
              </Link>

              <button
                onClick={() => navigate('/profile')}
                className="rounded-full p-0.5 ring-2 ring-[#D4A24C]/70"
                aria-label="Profile"
              >
                <img
                  src={
                    user?.avatar ||
                    'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=120&q=80'
                  }
                  alt={displayName}
                  className="w-7 h-7 rounded-full object-cover"
                />
              </button>
            </div>
          </div>
        </header>

        {/* -----------------------------------------------------------------
            DESKTOP TOP HEADER (lg+)
        ----------------------------------------------------------------- */}
        <header className="hidden lg:flex sticky top-0 z-20 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5E7EB] px-8 h-[76px] items-center gap-3">
          <button
            type="button"
            onClick={() => setDesktopCollapsed((v) => !v)}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-[#1F2937] transition"
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            <Menu size={22} />
          </button>

          <div className="min-w-0 flex-1 ml-2">
            <h1 className="font-sans text-2xl font-extrabold text-[#111827] leading-tight truncate">{pageTitle}</h1>
            {isDashboard && <p className="text-xs font-medium text-[#4B5563] truncate">{t('welcomeOwner')}</p>}
          </div>

          {/* Page-specific actions (period selector) */}
          <div ref={setHeaderSlot} className="flex items-center" />

          <button
            onClick={toggleLang}
            title="Switch Language (English / Kiswahili)"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#1F2937] hover:bg-gray-50 shadow-soft"
          >
            <Languages size={15} className="text-[#6D28D9]" />
            <span>{lang === 'sw' ? 'EN' : 'SW'}</span>
          </button>

          <Link
            to="/inventory"
            className="relative p-2.5 rounded-full border border-[#E5E7EB] bg-white text-[#1F2937] hover:bg-gray-50 shadow-soft"
            aria-label="Notifications"
            title="Low stock notifications"
          >
            <Bell size={18} />
            {lowStockCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                {lowStockCount}
              </span>
            )}
          </Link>

          <div className="relative">
            <button
              onClick={() => setAdminMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-full border border-[#E5E7EB] bg-white pl-1.5 pr-3 py-1 hover:bg-gray-50 shadow-soft transition"
            >
              <img
                src={
                  user?.avatar ||
                  'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=120&q=80'
                }
                alt={displayName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-[#7C3AED]/30"
              />
              <span className="text-sm font-semibold text-[#1F2937]">{displayName}</span>
              <ChevronDown size={14} className="text-[#6B7280]" />
            </button>

            {adminMenuOpen && (
              <div
                onMouseLeave={() => setAdminMenuOpen(false)}
                className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-[#E5E7EB] shadow-xl py-2 z-50 text-xs"
              >
                {user && (
                  <div className="px-4 py-2 border-b border-[#F3F4F6] mb-1">
                    <p className="font-bold text-[#111827] truncate">{user.name}</p>
                    <p className="text-[11px] text-[#6D28D9] font-semibold">{user.roleTitle}</p>
                  </div>
                )}
                <button
                  onClick={() => {
                    setAdminMenuOpen(false);
                    navigate('/profile');
                  }}
                  className="w-full px-4 py-2 text-left text-[#1F2937] hover:bg-gray-50 flex items-center gap-2 font-medium"
                >
                  <User size={14} className="text-[#6D28D9]" />
                  <span>{lang === 'sw' ? 'Wasifu Wangu' : 'My Profile'}</span>
                </button>
                {(user?.role === 'owner' || user?.role === 'manager') && (
                  <button
                    onClick={() => {
                      setAdminMenuOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full px-4 py-2 text-left text-[#1F2937] hover:bg-gray-50 flex items-center gap-2 font-medium"
                  >
                    <SettingsIcon size={14} className="text-[#6D28D9]" />
                    <span>{lang === 'sw' ? 'Mipangilio ya Saluni' : 'Salon Settings'}</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    toggleLang();
                    setAdminMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-[#1F2937] hover:bg-gray-50 flex items-center gap-2 font-medium"
                >
                  <Languages size={14} className="text-[#6D28D9]" />
                  <span>{lang === 'sw' ? 'Switch to English' : 'Badili kwenda Kiswahili'}</span>
                </button>
                <div className="my-1 border-t border-[#F3F4F6]" />
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-2 font-semibold"
                >
                  <LogOut size={14} />
                  <span>{lang === 'sw' ? 'Ondoka (Logout)' : 'Sign Out'}</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main Page Content (with extra bottom padding on mobile for the fixed bottom tab bar) */}
        <main className="p-3.5 sm:p-6 lg:p-7 pb-24 lg:pb-7 max-w-[1440px] w-full mx-auto bg-[#FFFFFF] animate-fade-in">
          <Outlet context={{ headerSlot } satisfies LayoutOutletContext} />
        </main>

        {/* -----------------------------------------------------------------
            DEDICATED MOBILE BOTTOM NAVIGATION BAR (< lg)
        ----------------------------------------------------------------- */}
        <nav
          aria-label="Mobile navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E5E7EB] shadow-[0_-4px_20px_rgba(17,24,39,0.08)] px-2 py-1.5"
        >
          <div className="grid grid-cols-5 items-center max-w-md mx-auto">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold transition ${
                  isActive ? 'text-[#6D28D9]' : 'text-[#6B7280]'
                }`
              }
            >
              <Home size={19} />
              <span className="mt-0.5 truncate">{lang === 'sw' ? 'Mwanzo' : 'Home'}</span>
            </NavLink>

            <NavLink
              to="/inventory"
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold transition ${
                  isActive ? 'text-[#6D28D9]' : 'text-[#6B7280]'
                }`
              }
            >
              <Package size={19} />
              <span className="mt-0.5 truncate">{lang === 'sw' ? 'Stoo' : 'Stock'}</span>
              {lowStockCount > 0 && (
                <span className="absolute top-0.5 right-4 w-2 h-2 rounded-full bg-[#EF4444]" />
              )}
            </NavLink>

            {/* Center Elevated Action Tab — Services & Sales */}
            <NavLink to="/sales" className="flex flex-col items-center justify-center">
              <div
                className={`-mt-6 w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition ${
                  location.pathname === '/sales'
                    ? 'bg-gradient-to-br from-[#D4A24C] to-[#975415] text-[#160D24] ring-4 ring-white'
                    : 'bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] text-white ring-4 ring-white shadow-[#6D28D9]/35'
                }`}
              >
                <Scissors size={20} />
              </div>
              <span
                className={`mt-0.5 text-[11px] font-bold ${
                  location.pathname === '/sales' ? 'text-[#6D28D9]' : 'text-[#1F2937]'
                }`}
              >
                {lang === 'sw' ? 'Mauzo' : 'Sales'}
              </span>
            </NavLink>

            {hasPermission('expenses') ? (
              <NavLink
                to="/expenses"
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold transition ${
                    isActive ? 'text-[#6D28D9]' : 'text-[#6B7280]'
                  }`
                }
              >
                <Wallet size={19} />
                <span className="mt-0.5 truncate">{lang === 'sw' ? 'Matumizi' : 'Expenses'}</span>
              </NavLink>
            ) : (
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold transition ${
                    isActive ? 'text-[#6D28D9]' : 'text-[#6B7280]'
                  }`
                }
              >
                <User size={19} />
                <span className="mt-0.5 truncate">{lang === 'sw' ? 'Wasifu' : 'Profile'}</span>
              </NavLink>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className={`flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold transition ${
                moreActive ? 'text-[#6D28D9]' : 'text-[#6B7280]'
              }`}
            >
              <LayoutGrid size={19} />
              <span className="mt-0.5 truncate">{lang === 'sw' ? 'Zaidi' : 'More'}</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

function LucentiaLogo({ className = 'w-16 h-16' }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const gradId = `goldGrad-${uid}`;
  return (
    <svg viewBox="0 0 96 96" className={`${className} drop-shadow-[0_4px_12px_rgba(212,162,76,0.35)]`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fae29c" />
          <stop offset="50%" stopColor="#d4a24c" />
          <stop offset="100%" stopColor="#9c6b1c" />
        </linearGradient>
      </defs>
      {/* Crown */}
      <path d="M34 22 L40 13 L48 20 L56 13 L62 22 Z" fill={`url(#${gradId})`} />
      <circle cx="40" cy="11" r="2" fill="#fae29c" />
      <circle cx="48" cy="10" r="2.3" fill="#fae29c" />
      <circle cx="56" cy="11" r="2" fill="#fae29c" />
      {/* Outer golden ring */}
      <circle cx="48" cy="54" r="30" fill="none" stroke={`url(#${gradId})`} strokeWidth="2.5" />
      {/* Stylized salon woman profile & flowing hair */}
      <path
        d="M34 44 C34 33, 52 30, 58 40 C64 50, 59 66, 48 74 C53 65, 54 55, 48 50 C43 46, 39 51, 40 57 C35 53, 34 48, 34 44 Z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M44 37 C52 37, 58 45, 55 56 C53 63, 46 69, 39 72 C45 66, 49 58, 47 51 C45 45, 41 42, 44 37 Z"
        fill="#fae29c"
        opacity="0.85"
      />
    </svg>
  );
}

function SidebarContent({
  isMobile = false,
  user,
  onNavigate,
  onLogout,
  hasPermission,
  t,
  lang,
}: {
  isMobile?: boolean;
  user: AuthUser | null;
  onNavigate: () => void;
  onLogout: () => void;
  hasPermission: (mod: string) => boolean;
  t: (k: string) => string;
  lang: Lang;
}) {
  const location = useLocation();
  const inventoryActive = ['/inventory', '/purchases'].includes(location.pathname);
  const [open, setOpen] = useState(inventoryActive);

  useEffect(() => {
    if (inventoryActive) setOpen(true);
  }, [inventoryActive]);

  const canAccessNavItem = (perm: string) => {
    if (perm === 'settings') {
      return (
        (user?.role === 'owner' || user?.role === 'manager') &&
        (hasPermission('settings') || hasPermission('categories'))
      );
    }
    if (perm === 'users') {
      return (
        (user?.role === 'owner' || user?.role === 'manager') &&
        hasPermission('users')
      );
    }
    if (perm === 'inventory') {
      return hasPermission('inventory') || hasPermission('purchases');
    }
    return hasPermission(perm);
  };

  const linkClass = (active: boolean) =>
    `w-full flex items-center gap-3 rounded-xl px-3.5 ${isMobile ? 'py-2' : 'py-2.5'} text-[13px] font-medium transition-all duration-200 ${
      active
        ? 'bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] text-white font-semibold shadow-lg shadow-[#6D28D9]/40 ring-1 ring-white/15'
        : 'text-white/80 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <div className="relative h-full flex flex-col overflow-hidden sidebar-dotted text-white">
      {/* Brand Header */}
      <div
        className={`relative flex flex-col items-center ${
          isMobile ? 'pt-4 pb-3' : 'pt-5 pb-4'
        } px-5 border-b border-white/10 shrink-0`}
      >
        <LucentiaLogo className={isMobile ? 'w-12 h-12' : 'w-16 h-16'} />
        <p
          className={`mt-1 font-display ${
            isMobile ? 'text-[19px]' : 'text-[22px]'
          } font-bold tracking-[0.14em] bg-gradient-to-r from-[#fae29c] via-[#e2b45a] to-[#c58e2d] bg-clip-text text-transparent`}
        >
          LUCENTIA
        </p>
        <p className="text-[11px] text-white/75 tracking-wide -mt-0.5">Beauty &amp; Salon</p>
      </div>

      {/* Live Sidebar User Profile Pill */}
      {user && (
        <Link
          to="/profile"
          onClick={onNavigate}
          className="mx-3.5 mt-2.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 flex items-center gap-2.5 transition shrink-0"
        >
          <img
            src={
              user.avatar ||
              'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=120&q=80'
            }
            alt={user.name}
            className="w-8 h-8 rounded-full object-cover ring-2 ring-[#D4A24C]/60 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate">{user.name}</p>
            <p className="text-[10px] font-semibold text-[#fae29c] truncate">{user.roleTitle}</p>
          </div>
        </Link>
      )}

      {/* Scrollable Navigation + Bottom Promo Container so Profile & Logout are never clipped */}
      <div className="relative flex-1 overflow-y-auto flex flex-col justify-between">
        <nav className="px-3.5 py-2.5 space-y-0.5">
          {navItems
            .filter((item) => canAccessNavItem(item.perm))
            .map((item) => {
              const Icon = item.icon;
              if (item.children) {
                const allowedChildren = item.children.filter((c) => hasPermission(c.perm));
                if (allowedChildren.length === 0) return null;
                return (
                  <div key={item.key}>
                    <button
                      onClick={() => setOpen((o) => !o)}
                      className={`${linkClass(false)} ${inventoryActive ? 'bg-white/10 text-white' : ''}`}
                    >
                      <Icon size={17} />
                      <span className="flex-1 text-left truncate">{t(item.key)}</span>
                      <ChevronRight size={15} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
                    </button>
                    {open && (
                      <div className="mt-0.5 ml-4 pl-3 border-l border-white/15 space-y-0.5">
                        {allowedChildren.map((c) => {
                          const CIcon = c.icon;
                          return (
                            <NavLink
                              key={c.to}
                              to={c.to}
                              onClick={onNavigate}
                              className={({ isActive }) => linkClass(isActive)}
                            >
                              <CIcon size={15} />
                              <span className="truncate">{t(c.key)}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) => {
                    const isStaffLink = item.key === 'staffManagement';
                    const activeState = isStaffLink
                      ? location.pathname === '/settings' && location.search.includes('tab=users')
                      : item.to === '/settings'
                        ? location.pathname === '/settings' && !location.search.includes('tab=users')
                        : isActive;
                    return linkClass(activeState);
                  }}
                >
                  <Icon size={17} />
                  <span className="truncate">
                    {item.labelEn ? (lang === 'sw' ? item.labelSw : item.labelEn) : t(item.key)}
                  </span>
                </NavLink>
              );
            })}

          <NavLink to="/profile" onClick={onNavigate} className={({ isActive }) => linkClass(isActive)}>
            <User size={17} />
            <span className="truncate">{lang === 'sw' ? 'Wasifu' : 'Profile'}</span>
          </NavLink>

          <button onClick={onLogout} className={linkClass(false)}>
            <LogOut size={17} />
            <span className="truncate">{lang === 'sw' ? 'Ondoka' : 'Logout'}</span>
          </button>
        </nav>

        {/* Bottom Salon Model Promo Card — flows naturally below Logout without clipping */}
        <div className="relative mt-2 shrink-0">
          <div className={`relative ${isMobile ? 'h-36 mx-3 mb-3 rounded-2xl' : 'h-48'} overflow-hidden`}>
            <img
              src="https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=600&q=80"
              alt="Lucentia Salon"
              className="w-full h-full object-cover object-top opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#160D24] via-[#160D24]/65 to-transparent" />
            <div className="absolute bottom-3 left-4 right-3">
              <p className={`${isMobile ? 'text-sm' : 'text-base'} font-bold leading-tight text-white drop-shadow`}>
                Grow Your
                <br />
                Salon Business
              </p>
              <p className="mt-0.5 font-display italic text-xs text-[#f5d68a]">{t('withLucentia')}</p>
              <div className="mt-1 h-[2px] w-20 rounded-full bg-gradient-to-r from-[#f5d68a] to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
