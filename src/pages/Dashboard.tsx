import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Package,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Scissors,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, todayISO, startOfMonthISO, startOfWeekISO, toISODate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { Sale, Expense, Product } from '@/lib/types';
import { BarChart, DonutChart } from '@/components/Charts';
import { EmptyState } from '@/components/StatusBadge';

interface DashboardData {
  salesToday: number;
  expensesToday: number;
  profitToday: number;
  customersToday: number;
  productsInStock: number;
  lowStockProducts: Product[];
  monthlyRevenue: number;
  monthlyExpenses: number;
  monthlyProfit: number;
  last7Days: { label: string; value: number }[];
  last6Months: { label: string; value: number }[];
  recentSales: Sale[];
  topServices: { label: string; value: number }[];
  expenseBreakdown: { label: string; value: number; color: string }[];
}

export function Dashboard() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    const today = todayISO();
    const monthStart = startOfMonthISO();
    const weekStart = startOfWeekISO();

    const [salesRes, expensesRes, productsRes, salesMonthRes, expensesMonthRes] = await Promise.all([
      supabase.from('sales').select('*').eq('sale_date', today),
      supabase.from('expenses').select('*').eq('expense_date', today),
      supabase.from('products').select('*').order('current_stock', { ascending: true }),
      supabase.from('sales').select('*').gte('sale_date', monthStart),
      supabase.from('expenses').select('*').gte('expense_date', monthStart),
    ]);

    const todaySales = (salesRes.data || []) as Sale[];
    const todayExpenses = (expensesRes.data || []) as Expense[];
    const products = (productsRes.data || []) as Product[];
    const monthSales = (salesMonthRes.data || []) as Sale[];
    const monthExpenses = (expensesMonthRes.data || []) as Expense[];

    const salesTodayTotal = todaySales.reduce((s, sale) => s + (sale.num_customers * sale.price_per_customer - sale.discount), 0);
    const expensesTodayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);
    const customersToday = todaySales.reduce((s, sale) => s + sale.num_customers, 0);
    const productsInStock = products.filter((p) => p.current_stock > 0).length;
    const lowStockProducts = products.filter((p) => p.current_stock <= p.low_stock_threshold);

    const monthlyRevenue = monthSales.reduce((s, sale) => s + (sale.num_customers * sale.price_per_customer - sale.discount), 0);
    const monthlyExpenses = monthExpenses.reduce((s, e) => s + e.amount, 0);

    // Last 7 days revenue
    const last7Days: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toISODate(d);
      const dayTotal = todaySales.length && dateStr === today ? salesTodayTotal : 0;
      last7Days.push({
        label: d.toLocaleDateString('en', { weekday: 'short' }),
        value: dayTotal,
      });
    }
    // Fetch last 7 days sales in one go
    const sevenDaysAgo = toISODate(new Date(Date.now() - 6 * 86400000));
    const weekSalesRes = await supabase.from('sales').select('*').gte('sale_date', sevenDaysAgo);
    const weekSales = (weekSalesRes.data || []) as Sale[];
    last7Days.forEach((day, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const ds = toISODate(d);
      day.value = weekSales
        .filter((s) => s.sale_date === ds)
        .reduce((sum, s) => sum + (s.num_customers * s.price_per_customer - s.discount), 0);
    });

    // Last 6 months revenue
    const last6Months: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mStart = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
      const mEnd = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      const monthData = monthSales.filter((s) => s.sale_date >= mStart && s.sale_date <= mEnd);
      // Also fetch earlier months if needed
      if (i > 0) {
        const mRes = await supabase.from('sales').select('*').gte('sale_date', mStart).lte('sale_date', mEnd);
        const mSales = (mRes.data || []) as Sale[];
        last6Months.push({
          label: d.toLocaleDateString('en', { month: 'short' }),
          value: mSales.reduce((sum, s) => sum + (s.num_customers * s.price_per_customer - s.discount), 0),
        });
      } else {
        last6Months.push({
          label: d.toLocaleDateString('en', { month: 'short' }),
          value: monthlyRevenue,
        });
      }
    }

    // Top services
    const serviceTotals: Record<string, number> = {};
    weekSales.forEach((s) => {
      const key = s.hairstyle_name || 'Service';
      serviceTotals[key] = (serviceTotals[key] || 0) + (s.num_customers * s.price_per_customer - s.discount);
    });
    const topServices = Object.entries(serviceTotals)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Expense breakdown by category
    const weekExpRes = await supabase.from('expenses').select('*, categories(name)').gte('expense_date', weekStart);
    const weekExpenses = (weekExpRes.data || []) as (Expense & { categories: { name: string } | null })[];
    const expByCat: Record<string, number> = {};
    weekExpenses.forEach((e) => {
      const cat = e.categories?.name || 'Other';
      expByCat[cat] = (expByCat[cat] || 0) + e.amount;
    });
    const colors = ['#e04b72', '#d9951f', '#7e63bf', '#16b063', '#3b82f6', '#f59e0b', '#ef4444'];
    const expenseBreakdown = Object.entries(expByCat).map(([label, value], i) => ({
      label,
      value,
      color: colors[i % colors.length],
    }));

    // Cost of products used this month
    const usageRes = await supabase.from('product_usage').select('*, products(unit_cost)').gte('usage_date', monthStart);
    const productCost = (usageRes.data || []).reduce((s: number, u: any) => s + u.quantity * (u.products?.unit_cost || 0), 0);

    setData({
      salesToday: salesTodayTotal,
      expensesToday: expensesTodayTotal,
      profitToday: salesTodayTotal - expensesTodayTotal - 0,
      customersToday,
      productsInStock,
      lowStockProducts,
      monthlyRevenue,
      monthlyExpenses,
      monthlyProfit: monthlyRevenue - monthlyExpenses - productCost,
      last7Days,
      last6Months,
      recentSales: todaySales.slice(0, 5),
      topServices,
      expenseBreakdown,
    });
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{t('dashboard')}</h1>
        <p className="text-sm text-ink-500 mt-1">{t('welcome')}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp size={20} />}
          label={t('salesToday')}
          value={formatCurrency(data.salesToday)}
          color="primary"
          trend="up"
        />
        <StatCard
          icon={<TrendingDown size={20} />}
          label={t('expensesToday')}
          value={formatCurrency(data.expensesToday)}
          color="error"
          trend="down"
        />
        <StatCard
          icon={<Wallet size={20} />}
          label={t('profitToday')}
          value={formatCurrency(data.profitToday)}
          color="success"
          trend={data.profitToday >= 0 ? 'up' : 'down'}
        />
        <StatCard
          icon={<Users size={20} />}
          label={t('customersToday')}
          value={String(data.customersToday)}
          color="accent"
        />
      </div>

      {/* Monthly summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MiniStat
          icon={<TrendingUp size={18} />}
          label={t('monthlyRevenue')}
          value={formatCurrency(data.monthlyRevenue)}
          color="text-primary-600"
          bg="bg-primary-50"
        />
        <MiniStat
          icon={<Receipt size={18} />}
          label={t('monthlyExpenses')}
          value={formatCurrency(data.monthlyExpenses)}
          color="text-error-600"
          bg="bg-error-50"
        />
        <MiniStat
          icon={<Wallet size={18} />}
          label={t('monthlyProfit')}
          value={formatCurrency(data.monthlyProfit)}
          color="text-success-600"
          bg="bg-success-50"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink-900">{t('revenueVsExpenses')}</h3>
            <span className="text-xs text-ink-400">{t('last7Days')}</span>
          </div>
          <BarChart data={data.last7Days} color="#e04b72" height={200} />
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink-900">{t('monthlyRevenue')}</h3>
            <span className="text-xs text-ink-400">{t('last6Months')}</span>
          </div>
          <BarChart data={data.last6Months} color="#d9951f" height={200} />
        </div>
      </div>

      {/* Low stock + top services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low stock alerts */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-warning-500" />
            <h3 className="font-semibold text-ink-900">{t('lowStockAlerts')}</h3>
          </div>
          {data.lowStockProducts.length === 0 ? (
            <EmptyState icon={<Package size={32} />} title={t('noData')} />
          ) : (
            <div className="space-y-2">
              {data.lowStockProducts.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl bg-warning-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Package size={16} className="text-warning-500" />
                    <span className="text-sm font-medium text-ink-700">{p.name}</span>
                  </div>
                  <span className={`text-sm font-semibold ${p.current_stock === 0 ? 'text-error-600' : 'text-warning-600'}`}>
                    {p.current_stock} {p.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top services */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Scissors size={18} className="text-primary-500" />
            <h3 className="font-semibold text-ink-900">{t('topServices')}</h3>
          </div>
          {data.topServices.length === 0 ? (
            <EmptyState icon={<Scissors size={32} />} title={t('noData')} />
          ) : (
            <div className="space-y-2">
              {data.topServices.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-ink-700">{s.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-ink-900">{formatCurrency(s.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent sales + expense breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-4">{t('recentSales')}</h3>
          {data.recentSales.length === 0 ? (
            <EmptyState icon={<Scissors size={32} />} title={t('noData')} />
          ) : (
            <div className="space-y-2">
              {data.recentSales.map((s) => {
                const total = s.num_customers * s.price_per_customer - s.discount;
                return (
                  <div key={s.id} className="flex items-center justify-between border-b border-ink-100 last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-ink-800">{s.hairstyle_name || 'Service'}</p>
                      <p className="text-xs text-ink-400">{s.customer_name || '—'} · {s.num_customers} {t('customers')}</p>
                    </div>
                    <span className="text-sm font-semibold text-success-600">{formatCurrency(total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-4">{t('expensesReport')}</h3>
          {data.expenseBreakdown.length === 0 ? (
            <EmptyState icon={<Receipt size={32} />} title={t('noData')} />
          ) : (
            <DonutChart data={data.expenseBreakdown} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'primary' | 'error' | 'success' | 'accent';
  trend?: 'up' | 'down';
}) {
  const colors = {
    primary: 'bg-primary-50 text-primary-600',
    error: 'bg-error-50 text-error-600',
    success: 'bg-success-50 text-success-600',
    accent: 'bg-accent-50 text-accent-600',
  };
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>{icon}</div>
        {trend && (
          <div className={`flex items-center text-xs font-medium ${trend === 'up' ? 'text-success-600' : 'text-error-600'}`}>
            {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          </div>
        )}
      </div>
      <p className="text-xs text-ink-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-ink-400">{label}</p>
        <p className="text-lg font-bold text-ink-900">{value}</p>
      </div>
    </div>
  );
}
