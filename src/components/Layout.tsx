import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Receipt,
  Scissors,
  FileBarChart,
  Settings as SettingsIcon,
  Menu,
  X,
  Languages,
} from 'lucide-react';
import { useI18n, type Lang } from '@/lib/i18n';

export type Page =
  | 'dashboard'
  | 'inventory'
  | 'purchases'
  | 'expenses'
  | 'sales'
  | 'reports'
  | 'settings';

interface LayoutProps {
  current: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

const navItems: { page: Page; icon: typeof LayoutDashboard; key: string }[] = [
  { page: 'dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { page: 'sales', icon: Scissors, key: 'sales' },
  { page: 'inventory', icon: Package, key: 'inventory' },
  { page: 'purchases', icon: ShoppingCart, key: 'purchases' },
  { page: 'expenses', icon: Receipt, key: 'expenses' },
  { page: 'reports', icon: FileBarChart, key: 'reports' },
  { page: 'settings', icon: SettingsIcon, key: 'settings' },
];

export function Layout({ current, onNavigate, children }: LayoutProps) {
  const { lang, setLang, t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const toggleLang = () => {
    const next: Lang = lang === 'sw' ? 'en' : 'sw';
    setLang(next);
  };

  return (
    <div className="min-h-screen bg-ink-50 flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 bg-white border-r border-ink-100 z-30">
        <SidebarContent current={current} onNavigate={handleNavigate} t={t} />
        <div className="border-t border-ink-100 p-4">
          <button onClick={toggleLang} className="btn btn-secondary w-full">
            <Languages size={16} />
            {lang === 'sw' ? 'English' : 'Kiswahili'}
          </button>
        </div>
      </aside>

      {/* Sidebar — mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white border-r border-ink-100 flex flex-col animate-slide-up">
            <div className="flex items-center justify-end p-4">
              <button onClick={() => setMobileOpen(false)} className="p-1.5 text-ink-400 hover:text-ink-700">
                <X size={22} />
              </button>
            </div>
            <SidebarContent current={current} onNavigate={handleNavigate} t={t} />
            <div className="border-t border-ink-100 p-4">
              <button onClick={toggleLang} className="btn btn-secondary w-full">
                <Languages size={16} />
                {lang === 'sw' ? 'English' : 'Kiswahili'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-ink-100 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 text-ink-600 hover:text-ink-900">
            <Menu size={24} />
          </button>
          <span className="font-display text-base font-semibold text-primary-600">Lucentia</span>
          <button onClick={toggleLang} className="p-1.5 text-ink-500">
            <Languages size={20} />
          </button>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  current,
  onNavigate,
  t,
}: {
  current: Page;
  onNavigate: (p: Page) => void;
  t: (k: string) => string;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-6 py-6 border-b border-ink-100">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-glow">
          <Scissors size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-ink-900 leading-tight truncate">Lucentia</p>
          <p className="text-[11px] text-ink-400 leading-tight">Beauty & Salon</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.page;
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-primary-500' : ''} />
              {t(item.key)}
            </button>
          );
        })}
      </nav>
    </>
  );
}
