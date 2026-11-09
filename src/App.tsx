import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import Layout from './components/Layout';
import { StartupLoader } from './components/StartupLoader';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Purchases } from './pages/Purchases';
import { Sales } from './pages/Sales';
import { Expenses } from './pages/Expenses';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Auth } from './pages/Auth';
import { Profile } from './pages/Profile';
import { I18nProvider, useI18n } from './lib/i18n';
import { AuthProvider, useAuth, type SystemModuleKey } from './lib/auth';
import { ToastProvider } from './components/Toast';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user } = useAuth();
  if (!user || (user.status && user.status !== 'active')) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RequirePermission({
  moduleKey,
  children,
}: {
  moduleKey: SystemModuleKey;
  children: React.ReactElement;
}) {
  const { user, canPerform } = useAuth();
  const { lang } = useI18n();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Settings module is strictly for salon owners and authorized managers:
  // Must have view permissions for settings, users, roles, or categories.
  // Note: 'services' permission is for the salon hairstyle/service catalogue, NOT salon admin settings!
  const allowed =
    moduleKey === 'settings'
      ? (user.role === 'owner' || user.role === 'manager') &&
        (canPerform('settings', 'view') ||
          canPerform('users', 'view') ||
          canPerform('roles', 'view') ||
          canPerform('categories', 'view'))
      : canPerform(moduleKey, 'view');

  if (!allowed) {
    return (
      <div className="panel p-8 max-w-lg mx-auto my-12 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] flex items-center justify-center mx-auto">
          <ShieldAlert size={28} />
        </div>
        <h2 className="text-lg font-extrabold text-[#111827]">
          {lang === 'sw' ? 'Huna Ruhusa ya Kufungua Ukurasa Huu (403)' : 'Access Restricted (403 Forbidden)'}
        </h2>
        <p className="text-xs text-[#4B5563] leading-relaxed">
          {lang === 'sw'
            ? `Cheo chako cha sasa (${user.roleTitle}) hakina ruhusa ya kuona moduli ya "${moduleKey}". Wasiliana na Msimamizi wa Saluni kuomba ruhusa.`
            : `Your current role (${user.roleTitle}) does not have permission to access the "${moduleKey}" module. Please contact your Salon Administrator if you require access.`}
        </p>
        <div className="pt-2">
          <Link to="/" className="btn btn-primary inline-flex items-center gap-2 text-xs">
            <ArrowLeft size={15} />
            <span>{lang === 'sw' ? 'Rudi Kwenye Dashibodi' : 'Return to Dashboard'}</span>
          </Link>
        </div>
      </div>
    );
  }

  return children;
}

function PublicOnly({ children }: { children: React.ReactElement }) {
  const { user } = useAuth();
  if (user && (!user.status || user.status === 'active')) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export function App() {
  const [booting, setBooting] = useState(true);

  return (
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          {booting && <StartupLoader onFinish={() => setBooting(false)} />}
          <BrowserRouter>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicOnly>
                    <Auth />
                  </PublicOnly>
                }
              />
              <Route path="/register" element={<Navigate to="/login" replace />} />
              <Route path="/signup" element={<Navigate to="/login" replace />} />
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<Dashboard />} />
                <Route
                  path="inventory"
                  element={
                    <RequirePermission moduleKey="inventory">
                      <Inventory />
                    </RequirePermission>
                  }
                />
                <Route
                  path="purchases"
                  element={
                    <RequirePermission moduleKey="purchases">
                      <Purchases />
                    </RequirePermission>
                  }
                />
                <Route
                  path="sales"
                  element={
                    <RequirePermission moduleKey="sales">
                      <Sales />
                    </RequirePermission>
                  }
                />
                <Route
                  path="expenses"
                  element={
                    <RequirePermission moduleKey="expenses">
                      <Expenses />
                    </RequirePermission>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <RequirePermission moduleKey="reports">
                      <Reports />
                    </RequirePermission>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <RequirePermission moduleKey="settings">
                      <Settings />
                    </RequirePermission>
                  }
                />
                <Route path="profile" element={<Profile />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
