import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext } from 'react-router-dom';
import {
  ShoppingCart,
  Coins,
  FileText,
  TrendingUp,
  BarChart3,
  Box,
  Star,
  Bell,
  Zap,
  ArrowRight,
  Scissors,
  Receipt,
  Trophy,
  Calendar,
  ShoppingBag,
  Wallet,
  Users,
  Sparkles,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import type { Sale, Expense, Product, Purchase, ProductUsage, Service, PurchaseItem } from '@/lib/types';
import type { LayoutOutletContext } from '@/components/Layout';
import { computeFinancialMetrics, getSaleNetAmount } from '@/lib/finance';

// ---------------------------------------------------------------------------
// Date helpers (local time, YYYY-MM-DD strings to match DB date columns)
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

type Period = 'today' | 'thisWeek' | 'thisMonth' | 'thisYear';
type Range = '7D' | '30D' | '3M' | '1Y';

function periodRange(p: Period): { start: string; end: string; prevStart: string; prevEnd: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === 'today') {
    const y = addDays(today, -1);
    return { start: ymd(today), end: ymd(today), prevStart: ymd(y), prevEnd: ymd(y) };
  }
  if (p === 'thisWeek') {
    const dow = today.getDay();
    const start = addDays(today, dow === 0 ? -6 : 1 - dow);
    return { start: ymd(start), end: ymd(today), prevStart: ymd(addDays(start, -7)), prevEnd: ymd(addDays(today, -7)) };
  }
  if (p === 'thisMonth') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevEnd = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate()),
    );
    return { start: ymd(start), end: ymd(today), prevStart: ymd(prevStart), prevEnd: ymd(prevEnd) };
  }
  const start = new Date(today.getFullYear(), 0, 1);
  return {
    start: ymd(start),
    end: ymd(today),
    prevStart: ymd(new Date(today.getFullYear() - 1, 0, 1)),
    prevEnd: ymd(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())),
  };
}

const inRange = (d: string | undefined | null, s: string, e: string) => !!d && d >= s && d <= e;
const saleTotal = (s: Sale) => getSaleNetAmount(s);

function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function shortMoney(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

function timeAgo(iso: string, lang: 'sw' | 'en'): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (lang === 'sw') {
    if (m < 1) return 'sasa hivi';
    if (m < 60) return `dakika ${m} zilizopita`;
    if (h < 24) return `saa ${h} zilizopita`;
    return `siku ${d} zilizopita`;
  }
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

// ---------------------------------------------------------------------------
// Raw data
// ---------------------------------------------------------------------------
interface RawData {
  sales: Sale[];
  expenses: Expense[];
  products: Product[];
  purchases: Purchase[];
  purchaseItems: (PurchaseItem & { products?: { name: string } | null })[];
  usage: (ProductUsage & { products?: { name: string; unit_cost: number } | null })[];
  services: Service[];
}

export function Dashboard() {
  const { t, lang } = useI18n();
  const { user, hasPermission } = useAuth();
  const role = user?.role || 'owner';
  const isOwner = role === 'owner';
  const isManager = role === 'manager';
  const isCashier = role === 'cashier';
  const isStylist = role === 'stylist';

  const outlet = useOutletContext<LayoutOutletContext | undefined>();
  const [raw, setRaw] = useState<RawData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('thisMonth');
  const [range, setRange] = useState<Range>('30D');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [s, e, p, pu, pi, u, sv] = await Promise.all([
        supabase.from('sales').select('*'),
        supabase.from('expenses').select('*'),
        supabase.from('products').select('*'),
        supabase.from('purchases').select('*'),
        supabase.from('purchase_items').select('*, products(name)'),
        supabase.from('product_usage').select('*, products(name, unit_cost)'),
        supabase.from('services').select('*'),
      ]);
      if (cancelled) return;
      setRaw({
        sales: s.data || [],
        expenses: e.data || [],
        products: p.data || [],
        purchases: pu.data || [],
        purchaseItems: pi.data || [],
        usage: u.data || [],
        services: sv.data || [],
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Derived metrics ----------------------------------------------------
  const m = useMemo(() => {
    if (!raw) return null;
    const { start, end, prevStart, prevEnd } = periodRange(period);
    // Single source of truth: shared financial calculation engine (same as Sales Ledger & Reports)
    const calc = (from: string, to: string) =>
      computeFinancialMetrics({
        sales: raw.sales,
        expenses: raw.expenses,
        purchases: raw.purchases,
        products: raw.products,
        usage: raw.usage,
        services: raw.services,
        start: from,
        end: to,
      });
    const sumSales = (from: string, to: string) =>
      raw.sales.filter((x) => inRange(x.sale_date, from, to)).reduce((sum, x) => sum + saleTotal(x), 0);
    const sumExp = (from: string, to: string) =>
      raw.expenses.filter((x) => inRange(x.expense_date, from, to)).reduce((sum, x) => sum + x.amount, 0);

    const cur = calc(start, end);
    const prev = calc(prevStart, prevEnd);
    const sales = cur.revenue;
    const expenses = cur.operatingExpenses;
    const purchases = cur.purchaseTotal;
    const net = cur.netProfit;

    const pSales = prev.revenue;
    const pExp = prev.operatingExpenses;
    const pPurch = prev.purchaseTotal;
    const pNet = prev.netProfit;

    // Inventory status
    const total = raw.products.length;
    const out = raw.products.filter((p) => p.current_stock <= 0).length;
    const low = raw.products.filter((p) => p.current_stock > 0 && p.current_stock <= p.low_stock_threshold).length;
    const ok = total - out - low;

    // Top services (by revenue within selected period)
    const svcName = new Map(raw.services.map((s) => [s.id, s.name]));
    const svcTotals: Record<string, number> = {};
    raw.sales
      .filter((x) => inRange(x.sale_date, start, end))
      .forEach((x) => {
        const key = (x.service_id && svcName.get(x.service_id)) || x.hairstyle_name || 'Service';
        svcTotals[key] = (svcTotals[key] || 0) + saleTotal(x);
      });
    const topSum = Object.values(svcTotals).reduce((a, b) => a + b, 0) || 1;
    const topServices = Object.entries(svcTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, value]) => ({
        label,
        value,
        pct: Math.round((value / topSum) * 100),
      }));

    // Profit summary — last 3 months
    const now = new Date();
    const months = [2, 1, 0].map((i) => {
      const ms = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const me = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      return {
        label: ms.toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en', { month: 'short' }),
        sales: sumSales(ymd(ms), ymd(me)),
        expenses: sumExp(ymd(ms), ymd(me)),
      };
    });

    // Recent activities
    const itemsByPurchase = new Map<string, typeof raw.purchaseItems>();
    raw.purchaseItems.forEach((i) => {
      const arr = itemsByPurchase.get(i.purchase_id) || [];
      arr.push(i);
      itemsByPurchase.set(i.purchase_id, arr);
    });
    type Activity = { id: string; kind: 'purchase' | 'service' | 'expense' | 'sale'; text: string; at: string };
    const at = (created?: string, date?: string) => created || (date ? `${date}T12:00:00` : new Date().toISOString());

    const sortedSales = [...raw.sales].sort((a, b) =>
      at(b.created_at, b.sale_date).localeCompare(at(a.created_at, a.sale_date)),
    );
    const activities: Activity[] = [
      ...raw.purchases.map((p) => {
        const items = itemsByPurchase.get(p.id) || [];
        const first = items[0];
        const detail = first
          ? `${first.products?.name || ''} (${first.quantity} units)`
          : formatCurrency(p.total_amount);
        return {
          id: `p-${p.id}`,
          kind: 'purchase' as const,
          text: `${t('activityPurchase')}: ${detail}`,
          at: at(p.created_at, p.purchase_date),
        };
      }),
      ...sortedSales.map((s) => {
        const svcLabel = (s.service_id && svcName.get(s.service_id)) || s.hairstyle_name || t('service');
        const client = s.customer_name ? ` · ${s.customer_name}` : '';
        return {
          id: `s-${s.id}`,
          kind: 'service' as const,
          text: `${t('activityService')}: ${svcLabel}${client} (${s.num_customers} ${
            s.num_customers === 1 ? t('customers').toLowerCase().slice(0, -1) || 'customer' : t('customers').toLowerCase()
          }) - ${formatCurrency(saleTotal(s))}`,
          at: at(s.created_at, s.sale_date),
        };
      }),
      ...raw.expenses.map((e) => ({
        id: `e-${e.id}`,
        kind: 'expense' as const,
        text: `${t('activityExpense')}: ${e.name} - ${formatCurrency(e.amount)}`,
        at: at(e.created_at, e.expense_date),
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at));

    const todayStr = ymd(now);
    const todaySales = raw.sales.filter((x) => x.sale_date === todayStr);
    const todaySalesTotal = todaySales.reduce((acc, x) => acc + saleTotal(x), 0);
    const todaySalesCount = todaySales.length;
    const avgTicket = todaySalesCount > 0 ? Math.round(todaySalesTotal / todaySalesCount) : 0;

    const todayExpenses = raw.expenses.filter((x) => x.expense_date === todayStr);
    const todayExpensesTotal = todayExpenses.reduce((acc, x) => acc + x.amount, 0);

    const paymentBreakdown: Record<string, number> = {
      cash: 0,
      mpesa: 0,
      airtel: 0,
      card: 0,
      other: 0,
    };
    todaySales.forEach((s) => {
      const pm = (s.payment_method || 'cash').toLowerCase();
      if (pm.includes('cash') || pm.includes('taslimu')) {
        paymentBreakdown.cash += saleTotal(s);
      } else if (pm.includes('mpesa') || pm.includes('m-pesa') || pm.includes('vodacom')) {
        paymentBreakdown.mpesa += saleTotal(s);
      } else if (pm.includes('airtel')) {
        paymentBreakdown.airtel += saleTotal(s);
      } else if (pm.includes('card') || pm.includes('bank') || pm.includes('crdb') || pm.includes('nmb')) {
        paymentBreakdown.card += saleTotal(s);
      } else {
        paymentBreakdown.other += saleTotal(s);
      }
    });

    const clientsServedToday = todaySales.reduce((sum, s) => sum + (s.num_customers || 1), 0);

    const filteredActivities = activities
      .filter((a) => {
        if (a.kind === 'purchase' && !hasPermission('purchases')) return false;
        if (a.kind === 'expense' && !hasPermission('expenses')) return false;
        return true;
      })
      .slice(0, 5);

    return {
      sales,
      expenses,
      purchases,
      net,
      trend: {
        sales: pctChange(sales, pSales),
        expenses: pctChange(expenses, pExp),
        purchases: pctChange(purchases, pPurch),
        net: pctChange(net, pNet),
      },
      inventory: { total, ok, low, out },
      topServices,
      months,
      activities: filteredActivities,
      growing: net >= pNet,
      todaySales,
      todaySalesTotal,
      todaySalesCount,
      avgTicket,
      todayExpensesTotal,
      paymentBreakdown,
      clientsServedToday,
    };
  }, [raw, period, t, lang]);

  // Sales overview series
  const series = useMemo(() => {
    if (!raw) return [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const byDay = new Map<string, number>();
    raw.sales.forEach((s) => byDay.set(s.sale_date, (byDay.get(s.sale_date) || 0) + saleTotal(s)));
    const sumRange = (a: Date, b: Date) => {
      let v = 0;
      for (let d = a; d <= b; d = addDays(d, 1)) v += byDay.get(ymd(d)) || 0;
      return v;
    };
    const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
      d.toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en', opts);

    if (range === '30D') {
      const days = 30;
      return Array.from({ length: days }, (_, i) => {
        const d = addDays(today, i - (days - 1));
        const dayNum = d.getDate();
        const lbl = `${fmt(d, { month: 'short' })} ${dayNum}`;
        const isLabelCheck = i % 5 === 0 || i === days - 1;
        return {
          label: lbl,
          axisLabel: isLabelCheck ? lbl : '',
          value: byDay.get(ymd(d)) || 0,
        };
      });
    }
    if (range === '7D') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = addDays(today, i - 6);
        const lbl = fmt(d, { weekday: 'short' });
        return { label: lbl, axisLabel: lbl, value: byDay.get(ymd(d)) || 0 };
      });
    }
    if (range === '3M') {
      return Array.from({ length: 12 }, (_, i) => {
        const end = addDays(today, -(11 - i) * 7);
        const start = addDays(end, -6);
        const lbl = fmt(end, { month: 'short', day: 'numeric' });
        return { label: lbl, axisLabel: i % 3 === 0 || i === 11 ? lbl : '', value: sumRange(start, end) };
      });
    }
    return Array.from({ length: 12 }, (_, i) => {
      const ms = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
      const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0);
      const lbl = fmt(ms, { month: 'short' });
      return { label: lbl, axisLabel: i % 2 === 0 || i === 11 ? lbl : '', value: sumRange(ms, me > today ? today : me) };
    });
  }, [raw, range, lang]);

  const periodSelector = (
    <label className="relative inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white pl-3 pr-2 py-2 text-sm font-semibold text-[#1F2937] shadow-soft">
      <Calendar size={16} className="text-[#6D28D9]" />
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as Period)}
        className="appearance-none bg-transparent pr-5 outline-none cursor-pointer"
      >
        <option value="today">{t('today')}</option>
        <option value="thisWeek">{t('thisWeek')}</option>
        <option value="thisMonth">{t('thisMonth')}</option>
        <option value="thisYear">{t('thisYear')}</option>
      </select>
      <span className="pointer-events-none absolute right-3 text-[#6B7280] text-xs">▾</span>
    </label>
  );

  if (loading || !m) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-9 h-9 border-[3px] border-[#EDE9FE] border-t-[#6D28D9] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {outlet?.headerSlot && createPortal(periodSelector, outlet.headerSlot)}

      {/* Role-Aware Header Greeting & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-[#F9FAFB] via-white to-[#F5F3FF] border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] text-white flex items-center justify-center shadow-md shadow-[#6D28D9]/25 shrink-0">
            {isOwner && <Trophy size={22} className="text-[#fae29c]" />}
            {isManager && <ShieldCheck size={22} className="text-[#fae29c]" />}
            {isCashier && <Coins size={22} className="text-white" />}
            {isStylist && <Scissors size={22} className="text-white" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-[#111827]">
                {isOwner && (lang === 'sw' ? 'Dashibodi ya Mkurugenzi' : 'Salon Executive Dashboard')}
                {isManager && (lang === 'sw' ? 'Usimamizi wa Uendeshaji' : 'Operations Management')}
                {isCashier && (lang === 'sw' ? 'Dawati la Mauzo na Mapokezi' : 'Front Desk & Cashier Station')}
                {isStylist && (lang === 'sw' ? 'Kituo cha Mitindo ya Nywele' : 'Styling & Beautician Workstation')}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EDE9FE] text-[#6D28D9] border border-[#DDD6FE]">
                {user?.roleTitle || role}
              </span>
            </div>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {isOwner && (lang === 'sw' ? 'Muhtasari wa mauzo, faida halisi na ukuaji wa saluni' : 'Strategic overview of salon revenue, net profitability and growth')}
              {isManager && (lang === 'sw' ? 'Usimamizi wa manunuzi ya stoo, matumizi, mauzo na shughuli za wafanyakazi' : 'Daily stock health, purchases, sales orders and staff operations')}
              {isCashier && (lang === 'sw' ? 'Utoaji wa risiti, makusanyo ya malipo ya wateja na kusawazisha droo ya mauzo' : 'Fast counter billing, payment collection, and daily shift till reconciliation')}
              {isStylist && (lang === 'sw' ? 'Huduma za wateja, mitindo iliyokamilika na akiba ya bidhaa za saluni' : 'Customer hairstyles completed, service logging and styling supply status')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {periodSelector}
        </div>
      </div>

      {/* Role-Specific Quick Action Banners */}
      {isCashier && (
        <div className="bg-gradient-to-r from-[#6D28D9] to-[#5B21B6] rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-[#6D28D9]/25">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Sparkles size={24} className="text-[#fae29c]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                {lang === 'sw' ? 'Tayari Kuhudumia Mteja wa Saluni?' : 'Ready to Serve Salon Clients?'}
              </p>
              <p className="text-xs text-white/80 mt-0.5">
                {lang === 'sw' ? 'Sajili mauzo ya huduma au bidhaa, chagua njia ya malipo na toa risiti ya haraka.' : 'Record customer hairstyle services or retail products, take payments and issue receipts.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <Link
              to="/sales"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#fae29c] to-[#d4a24c] text-[#160D24] font-black text-xs shadow-md hover:brightness-105 transition"
            >
              <Scissors size={15} />
              <span>{lang === 'sw' ? '+ Rekodi Mauzo Mapya (POS)' : '+ Record Customer Sale'}</span>
            </Link>
            {hasPermission('expenses') && (
              <Link
                to="/expenses"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition"
              >
                <Wallet size={15} />
                <span>{lang === 'sw' ? '+ Matumizi Madogo' : '+ Petty Cash'}</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {isStylist && (
        <div className="bg-gradient-to-r from-[#160D24] to-[#2D1B4E] rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row items-center justify-between gap-4 border border-[#3b2366] shadow-lg">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4A24C] to-[#975415] text-[#160D24] flex items-center justify-center shrink-0">
              <Scissors size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-[#fae29c]">
                {lang === 'sw' ? 'Kituo cha Mitindo ya Nywele na Urembo' : 'Hairstyling & Beauty Workstation'}
              </p>
              <p className="text-xs text-white/80 mt-0.5">
                {lang === 'sw' ? 'Weka kumbukumbu ya mitindo uliyofanya leo kwa wateja na angalia bidhaa zilizopo stoo.' : 'Log finished customer hairstyles, track clients served today and verify available styling supplies.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <Link
              to="/sales"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] text-white font-bold text-xs shadow-md hover:bg-[#5B21B6] transition"
            >
              <Scissors size={15} />
              <span>{lang === 'sw' ? '+ Sajili Mtindo Uliomaliza' : '+ Log Finished Service'}</span>
            </Link>
            <Link
              to="/inventory"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 transition"
            >
              <Box size={15} />
              <span>{lang === 'sw' ? 'Angalia Akiba ya Stoo' : 'Check Products'}</span>
            </Link>
          </div>
        </div>
      )}

      {/* Role-Specific KPI Cards */}
      {isCashier ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label={lang === 'sw' ? 'Mauzo ya Leo' : "Today's Sales Revenue"}
            value={m.todaySalesTotal}
            icon={<Coins size={22} />}
            ghost={<Receipt size={64} />}
            tone="gold"
            t={t}
          />
          <KpiCard
            label={lang === 'sw' ? 'Risiti / Mauzo ya Leo' : "Today's Completed Receipts"}
            value={m.todaySalesCount}
            isCount
            icon={<Receipt size={22} />}
            ghost={<FileText size={64} />}
            tone="violet"
            t={t}
          />
          <KpiCard
            label={lang === 'sw' ? 'Wastani wa Risiti' : 'Average Ticket Value'}
            value={m.avgTicket}
            icon={<TrendingUp size={22} />}
            ghost={<BarChart3 size={64} />}
            tone="green"
            t={t}
          />
          <KpiCard
            label={lang === 'sw' ? 'Matumizi Madogo Leo' : 'Petty Cash Out Today'}
            value={m.todayExpensesTotal}
            icon={<Wallet size={22} />}
            ghost={<Wallet size={64} />}
            tone="orange"
            t={t}
          />
        </div>
      ) : isStylist ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label={lang === 'sw' ? 'Mitindo Iliyokamilika Leo' : 'Services Completed Today'}
            value={m.todaySalesCount}
            isCount
            icon={<Scissors size={22} />}
            ghost={<Scissors size={64} />}
            tone="violet"
            t={t}
          />
          <KpiCard
            label={lang === 'sw' ? 'Mapato ya Mitindo Leo' : "Today's Service Revenue"}
            value={m.todaySalesTotal}
            icon={<Coins size={22} />}
            ghost={<Receipt size={64} />}
            tone="gold"
            t={t}
          />
          <KpiCard
            label={lang === 'sw' ? 'Wateja Waliohudumiwa' : 'Clients Served Today'}
            value={m.clientsServedToday}
            isCount
            icon={<Users size={22} />}
            ghost={<Users size={64} />}
            tone="green"
            t={t}
          />
          <KpiCard
            label={lang === 'sw' ? 'Bidhaa Zilizopo Stoo' : 'In-Stock Salon Supplies'}
            value={m.inventory.ok}
            isCount
            icon={<Box size={22} />}
            ghost={<Box size={64} />}
            tone="orange"
            t={t}
          />
        </div>
      ) : (
        /* Owner & Manager Executive KPI Cards */
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {hasPermission('purchases') && (
            <KpiCard
              label={t('totalPurchases')}
              value={m.purchases}
              trend={m.trend.purchases}
              icon={<ShoppingCart size={22} />}
              ghost={<ShoppingBag size={64} />}
              tone="violet"
              t={t}
            />
          )}
          {hasPermission('sales') && (
            <KpiCard
              label={t('totalSales')}
              value={m.sales}
              trend={m.trend.sales}
              icon={<Coins size={22} />}
              ghost={<BarChart3 size={64} />}
              tone="gold"
              t={t}
            />
          )}
          {hasPermission('expenses') && (
            <KpiCard
              label={t('totalExpenses')}
              value={m.expenses}
              trend={m.trend.expenses}
              icon={<FileText size={22} />}
              ghost={<Wallet size={64} />}
              tone="orange"
              t={t}
            />
          )}
          {hasPermission('reports') && (
            <KpiCard
              label={isOwner ? t('netProfit') : (lang === 'sw' ? 'Faida ya Uendeshaji' : 'Operating Margin')}
              value={m.net}
              trend={m.trend.net}
              icon={<TrendingUp size={22} />}
              ghost={<Trophy size={64} />}
              tone="green"
              t={t}
            />
          )}
        </div>
      )}

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Sales overview chart — visible for Owner, Manager and Cashier */}
        {!isStylist && (
          <div className={`panel p-5 lg:col-span-12 ${isCashier ? 'xl:col-span-6' : 'xl:col-span-5'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <PanelTitle icon={<BarChart3 size={18} />} title={t('salesOverview')} />
              <div className="inline-flex rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-1">
                {(['7D', '30D', '3M', '1Y'] as Range[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      range === r
                        ? 'bg-[#6D28D9] text-white shadow-xs'
                        : 'text-[#4B5563] hover:text-[#111827]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <AreaChart data={series} />
          </div>
        )}

        {/* Inventory status */}
        <div
          className={`panel p-5 ${
            isStylist
              ? 'lg:col-span-6 xl:col-span-6'
              : isCashier
              ? 'lg:col-span-6 xl:col-span-3'
              : 'lg:col-span-6 xl:col-span-4'
          } flex flex-col`}
        >
          <PanelTitle icon={<Box size={18} />} title={t('inventoryStatus')} />
          {m.inventory.total === 0 ? (
            <div className="my-auto py-8 text-center text-xs text-[#6B7280]">
              <div className="w-12 h-12 rounded-2xl bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] flex items-center justify-center mx-auto mb-2.5">
                <Box size={22} />
              </div>
              <p className="font-bold text-[#1F2937] text-sm">
                {lang === 'sw' ? 'Hakuna bidhaa kwenye stoo bado' : 'No products in inventory yet'}
              </p>
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                {lang === 'sw' ? 'Sajili bidhaa za saluni ili kufuatilia akiba' : 'Register salon products to track live stock & valuation'}
              </p>
              {hasPermission('inventory') && (
                <Link
                  to="/inventory"
                  className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-[#6D28D9] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#5B21B6] transition"
                >
                  + {lang === 'sw' ? 'Ongeza Bidhaa ya Kwanza' : 'Add Your First Product'}
                </Link>
              )}
            </div>
          ) : (
            <>
              <InventoryDonut {...m.inventory} t={t} />
              <div className="mt-auto rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] px-4 py-3 flex items-center gap-3">
                <Bell size={20} className="text-[#D4A24C] fill-[#D4A24C] shrink-0" />
                <div className="flex-1 text-xs text-[#1F2937] leading-tight">
                  {m.inventory.low + m.inventory.out > 0 ? (
                    <>
                      <p className="font-bold text-[#111827]">
                        {m.inventory.low + m.inventory.out} {t('items')}
                      </p>
                      <p className="text-[#4B5563]">{t('productsLowStock')}</p>
                    </>
                  ) : (
                    <p>{t('allStockHealthy')}</p>
                  )}
                </div>
                {hasPermission('inventory') && (
                  <Link
                    to="/inventory"
                    className="shrink-0 rounded-xl bg-[#6D28D9] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5B21B6]"
                  >
                    {t('viewDetails')}
                  </Link>
                )}
              </div>
            </>
          )}
        </div>

        {/* Top services */}
        <div
          className={`panel p-5 ${
            isStylist
              ? 'lg:col-span-6 xl:col-span-6'
              : isCashier
              ? 'lg:col-span-6 xl:col-span-3'
              : 'lg:col-span-6 xl:col-span-3'
          }`}
        >
          <PanelTitle icon={<Star size={18} className="fill-[#D4A24C] text-[#D4A24C]" />} title={t('topServices')} />
          {m.topServices.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#6B7280]">
              <div className="w-10 h-10 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] flex items-center justify-center mx-auto mb-2">
                <Scissors size={18} />
              </div>
              <p className="font-bold text-[#374151]">
                {lang === 'sw' ? 'Hakuna mauzo ya huduma bado' : 'No service sales in this period'}
              </p>
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                {lang === 'sw' ? 'Mauzo yatakapofanyika yataonekana hapa' : 'Recorded services will be ranked here by revenue'}
              </p>
              {hasPermission('sales') && (
                <Link
                  to="/sales"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#6D28D9] hover:underline"
                >
                  + {lang === 'sw' ? 'Rekodi Mauzo ya Kwanza' : 'Record First Sale'}
                </Link>
              )}
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#F3F4F6]">
              {m.topServices.map((s, i) => (
                <li key={s.label} className="flex items-center gap-3 py-2.5">
                  <ServiceAvatar index={i} label={s.label} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#1F2937] truncate">{s.label}</p>
                    <p className="text-xs font-medium text-[#4B5563]">{formatCurrency(s.value)}</p>
                  </div>
                  <span className="rounded-lg bg-[#F5F3FF] border border-[#DDD6FE] px-2.5 py-1 text-xs font-bold text-[#6D28D9]">
                    {s.pct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Role-Scoped Bottom Row */}
      {isCashier ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <TodaySalesStreamCard todaySales={m.todaySales} lang={lang} services={raw?.services || []} />
          </div>
          <div className="lg:col-span-5">
            <TodayCashRegisterCard paymentBreakdown={m.paymentBreakdown} todayTotal={m.todaySalesTotal} lang={lang} />
          </div>
        </div>
      ) : isStylist ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <TodayStylingLogCard todaySales={m.todaySales} lang={lang} services={raw?.services || []} />
          </div>
          <div className="lg:col-span-5">
            <StylistSuppliesCard products={raw?.products || []} lang={lang} />
          </div>
        </div>
      ) : (
        /* Owner & Manager Bottom Row */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Recent activities */}
          <div className={`panel p-5 lg:col-span-6 ${isOwner ? 'xl:col-span-5' : 'xl:col-span-7'}`}>
            <div className="flex items-center justify-between mb-3">
              <PanelTitle icon={<Zap size={18} className="fill-[#6D28D9] text-[#6D28D9]" />} title={t('recentActivities')} />
              {hasPermission('reports') && (
                <Link
                  to="/reports"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#6D28D9] hover:underline"
                >
                  {t('viewAll')} <ArrowRight size={14} />
                </Link>
              )}
            </div>
            {m.activities.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#6B7280]">
                <p className="font-semibold text-[#374151]">
                  {lang === 'sw' ? 'Hakuna shughuli zilizorekodiwa hivi karibuni' : 'No recent salon activities yet'}
                </p>
                <p className="text-[11px] text-[#6B7280] mt-0.5">
                  {lang === 'sw' ? 'Shughuli za mauzo, manunuzi na matumizi zitaonekana hapa' : 'Sales, purchases, and expenses will stream here in real time'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#F3F4F6]">
                {m.activities.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <ActivityIcon kind={a.kind} />
                    <p className="flex-1 min-w-0 text-[13px] font-medium text-[#1F2937] truncate">{a.text}</p>
                    <span className="shrink-0 text-[11px] font-medium text-[#6B7280]">{timeAgo(a.at, lang)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Profit summary — Purple & Gold Accents */}
          {hasPermission('reports') && (
            <div className={`panel p-5 lg:col-span-6 ${isOwner ? 'xl:col-span-4' : 'xl:col-span-5'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <PanelTitle icon={<BarChart3 size={18} />} title={t('profitSummary')} />
                <div className="flex items-center gap-3 text-xs font-semibold text-[#374151]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#6D28D9]" />
                    {t('salesLabel')}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#D4A24C]" />
                    {t('expensesLabel')}
                  </span>
                </div>
              </div>
              <GroupedBars data={m.months} />
            </div>
          )}

          {/* Owner Growth banner — Strictly for Salon Owner */}
          {isOwner && (
            <div className="relative overflow-hidden rounded-2xl p-6 text-white sidebar-dotted border border-[#2d1b4e] shadow-xl lg:col-span-12 xl:col-span-3 min-h-[215px] flex flex-col justify-between">
              <div className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-[#D4A24C]/20 blur-2xl" />

              <svg
                viewBox="0 0 120 110"
                className="pointer-events-none absolute right-4 bottom-16 w-28 h-24 overflow-visible"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="goldBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fae19c" />
                    <stop offset="100%" stopColor="#b78128" />
                  </linearGradient>
                  <linearGradient id="goldArrow" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#c79234" />
                    <stop offset="100%" stopColor="#fce5a2" />
                  </linearGradient>
                </defs>
                <path
                  d="M 10 72 Q 52 56 96 14"
                  fill="none"
                  stroke="url(#goldArrow)"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <polygon points="103,7 86,12 97,24" fill="#fce5a2" />
                <rect x="14" y="84" width="14" height="20" rx="2.5" fill="url(#goldBar)" />
                <rect x="36" y="70" width="14" height="34" rx="2.5" fill="url(#goldBar)" />
                <rect x="58" y="54" width="14" height="50" rx="2.5" fill="url(#goldBar)" />
                <rect x="80" y="34" width="14" height="70" rx="2.5" fill="url(#goldBar)" />
              </svg>

              <div className="relative flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#f5d68a]/15 border border-[#f5d68a]/30 flex items-center justify-center shrink-0">
                  <Trophy size={24} className="text-[#f5d68a]" />
                </div>
                <p className="text-lg font-extrabold leading-snug max-w-[10.5rem]">
                  {m.growing ? t('businessGrowing') : t('businessAttention')}
                </p>
              </div>

              <div className="relative my-2">
                <p className="text-xs text-white/80 font-medium">{t('netProfitPeriod')}</p>
                <p
                  className={`mt-0.5 text-2xl font-extrabold tracking-tight ${
                    m.net >= 0 ? 'text-[#f5d68a]' : 'text-[#fca5a5]'
                  }`}
                >
                  {formatCurrency(m.net)}
                </p>
              </div>

              <Link
                to="/reports"
                className="relative self-end inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#f5d68a] to-[#d4a24c] px-4 py-2 text-xs font-bold text-[#160D24] shadow-lg hover:brightness-105 transition"
              >
                {t('viewReports')} <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
const tones = {
  violet: {
    icon: 'bg-[#F5F3FF] text-[#6D28D9] border border-[#DDD6FE]',
    ghost: 'text-[#EDE9FE]',
  },
  gold: {
    icon: 'bg-[#FDFAEF] text-[#B8862D] border border-[#F4DE9E]',
    ghost: 'text-[#FAF0D4]',
  },
  orange: {
    icon: 'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]',
    ghost: 'text-[#FEF3C7]',
  },
  green: {
    icon: 'bg-[#EDFCF2] text-[#098F50] border border-[#AAEFC6]',
    ghost: 'text-[#D3F8E0]',
  },
};

function KpiCard({
  label,
  value,
  trend,
  icon,
  ghost,
  tone,
  t,
  isCount,
}: {
  label: string;
  value: number;
  trend?: number | null;
  icon: React.ReactNode;
  ghost: React.ReactNode;
  tone: keyof typeof tones;
  t: (k: string) => string;
  isCount?: boolean;
}) {
  const c = tones[tone];
  const up = trend !== undefined && trend !== null && trend >= 0;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_2px_12px_-3px_rgba(17,24,39,0.06)] p-3.5 sm:p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`hidden sm:block pointer-events-none absolute right-3 bottom-2 ${c.ghost}`}>{ghost}</div>
      <div className="relative flex flex-col sm:flex-row items-start gap-2.5 sm:gap-3.5">
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${c.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 w-full">
          <p className="text-[11px] sm:text-xs font-semibold text-[#4B5563] truncate">{label}</p>
          <p className="mt-0.5 text-base sm:text-2xl font-extrabold text-[#111827] tracking-tight truncate">
            {isCount ? value.toLocaleString() : formatCurrency(value)}
          </p>
          {trend !== undefined && (
            <p className="mt-1 text-[11px] sm:text-xs text-[#4B5563] flex items-center gap-1">
              {trend === null ? (
                <span className="font-semibold text-[#6D28D9]">New</span>
              ) : (
                <span
                  className={`inline-flex items-center gap-0.5 font-bold ${
                    up ? 'text-[#098F50]' : 'text-[#DC2626]'
                  }`}
                >
                  {up ? '↑' : '↓'} {Math.abs(trend).toFixed(0)}%
                </span>
              )}
              <span className="truncate">{t('vsLastPeriod')}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#6D28D9]">{icon}</span>
      <h3 className="font-sans text-base font-bold text-[#111827]">{title}</h3>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-[#6B7280]">{text}</p>;
}

function AreaChart({ data }: { data: { label: string; axisLabel?: string; value: number }[] }) {
  const { lang } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 250;
  const pad = { l: 44, r: 22, t: 32, b: 32 };
  const hasData = data.some((d) => d.value > 0);

  if (!hasData) {
    return (
      <div className="h-[250px] flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-[#E5E7EB] rounded-2xl bg-[#F9FAFB]">
        <Coins size={30} className="text-[#9CA3AF] mb-2" />
        <p className="text-sm font-bold text-[#374151]">
          {lang === 'sw' ? 'Hakuna mauzo yaliyorekodiwa kwa kipindi hiki' : 'No sales recorded for this period'}
        </p>
        <p className="text-xs text-[#6B7280] mt-1">
          {lang === 'sw'
            ? 'Rekodi mauzo ya kwanza ili kuona mwenendo wa chati ya mauzo'
            : 'Record your first sale to start visualizing real sales trends'}
        </p>
        <Link
          to="/sales"
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-[#6D28D9] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#5B21B6] transition"
        >
          + {lang === 'sw' ? 'Rekodi Mauzo ya Kwanza' : 'Record Your First Sale'}
        </Link>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 0);
  const niceMax = (() => {
    if (max <= 0) return 100_000;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.max(10_000, Math.ceil(max / p) * p);
  })();
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / niceMax) * ih;
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const area = `M${x(0)},${pad.t + ih} L${pts.replace(/ /g, ' L')} L${x(data.length - 1)},${pad.t + ih} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);
  const focus = hover ?? data.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.28" />
          <stop offset="65%" stopColor="#D4A24C" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#F3F4F6" />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fontWeight="500" fill="#4B5563">
            {shortMoney(v)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const lbl = d.axisLabel !== undefined ? d.axisLabel : d.label;
        return lbl ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="500" fill="#4B5563">
            {lbl}
          </text>
        ) : null;
      })}
      <path d={area} fill="url(#salesArea)" />
      <polyline
        points={pts}
        fill="none"
        stroke="#6D28D9"
        strokeWidth="2.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((d, i) => (
        <g key={i}>
          <rect
            x={x(i) - iw / data.length / 2}
            y={pad.t}
            width={iw / data.length}
            height={ih}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
          <circle
            cx={x(i)}
            cy={y(d.value)}
            r={i === focus ? 6 : 4}
            fill={i === focus ? '#D4A24C' : '#6D28D9'}
            stroke={i === focus ? '#160D24' : '#FFFFFF'}
            strokeWidth="2"
          />
        </g>
      ))}
      {data[focus] && (
        <g
          transform={`translate(${Math.min(Math.max(x(focus), pad.l + 58), W - pad.r - 58)}, ${Math.max(
            y(data[focus].value) - 20,
            16,
          )})`}
        >
          <rect x={-58} y={-15} width={116} height={25} rx={12} fill="#160D24" stroke="#D4A24C" strokeWidth="1" />
          <text x={0} y={2} textAnchor="middle" fontSize="11" fontWeight="700" fill="#FAE29C">
            {formatCurrency(data[focus].value)}
          </text>
        </g>
      )}
    </svg>
  );
}

function InventoryDonut({
  total,
  ok,
  low,
  out,
  t,
}: {
  total: number;
  ok: number;
  low: number;
  out: number;
  t: (k: string) => string;
}) {
  const segs = [
    { label: t('inStock'), value: ok, color: '#6D28D9' },
    { label: t('lowStock'), value: low, color: '#D4A24C' },
    { label: t('outOfStock'), value: out, color: '#EF4444' },
  ];
  const R = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-4 my-auto">
      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#F3F4F6" strokeWidth="14" />
          {total > 0 &&
            segs.map((s) => {
              const len = (s.value / total) * C;
              const el = (
                <circle
                  key={s.label}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="14"
                  strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-[#111827]">{pct(ok)}%</span>
          <span className="text-[11px] font-semibold text-[#4B5563]">{t('inStock')}</span>
        </div>
      </div>
      <ul className="space-y-3">
        {segs.map((s) => (
          <li key={s.label} className="flex items-start gap-2.5">
            <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <div className="text-xs leading-snug">
              <p className="font-bold text-[#1F2937]">{s.label}</p>
              <p className="font-medium text-[#6B7280]">({pct(s.value)}%)</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const servicePhotos = [
  'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=160&q=80',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=160&q=80',
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=160&q=80',
  'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=160&q=80',
];

function ServiceAvatar({ index, label }: { index: number; label: string }) {
  const [imgErr, setImgErr] = useState(false);
  const src = servicePhotos[index % servicePhotos.length];
  if (imgErr) {
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] flex items-center justify-center text-white shadow-xs shrink-0">
        <Scissors size={18} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={label}
      onError={() => setImgErr(true)}
      className="w-11 h-11 rounded-xl object-cover shadow-xs shrink-0 border border-[#E5E7EB]"
    />
  );
}

function ActivityIcon({ kind }: { kind: 'purchase' | 'service' | 'expense' | 'sale' }) {
  const map = {
    purchase: { icon: <ShoppingCart size={15} />, cls: 'bg-[#DCFCE7] text-[#16A34A]' },
    service: { icon: <Scissors size={15} />, cls: 'bg-[#EDE9FE] text-[#6D28D9]' },
    expense: { icon: <Receipt size={15} />, cls: 'bg-[#FAF0D4] text-[#B8862D]' },
    sale: { icon: <BarChart3 size={15} />, cls: 'bg-[#D1FAE5] text-[#059669]' },
  }[kind];
  return <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${map.cls}`}>{map.icon}</span>;
}

function GroupedBars({ data }: { data: { label: string; sales: number; expenses: number }[] }) {
  const W = 400;
  const H = 200;
  const pad = { l: 42, r: 12, t: 14, b: 28 };
  const max = Math.max(...data.flatMap((d) => [d.sales, d.expenses]), 0);
  const niceMax = (() => {
    if (max <= 0) return 100_000;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.max(10_000, Math.ceil(max / p) * p);
  })();
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const group = iw / data.length;
  const bw = Math.min(24, group / 3.4);
  const y = (v: number) => pad.t + ih - (v / niceMax) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="barSales" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#5B21B6" />
        </linearGradient>
        <linearGradient id="barExpenses" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4DE9E" />
          <stop offset="50%" stopColor="#D4A24C" />
          <stop offset="100%" stopColor="#B8862D" />
        </linearGradient>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#F3F4F6" />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fontWeight="500" fill="#4B5563">
            {shortMoney(v)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = pad.l + group * i + group / 2;
        return (
          <g key={d.label}>
            <rect
              x={cx - bw - 3}
              y={y(d.sales)}
              width={bw}
              height={pad.t + ih - y(d.sales)}
              rx={4}
              fill="url(#barSales)"
            >
              <title>{formatCurrency(d.sales)}</title>
            </rect>
            <rect
              x={cx + 3}
              y={y(d.expenses)}
              width={bw}
              height={pad.t + ih - y(d.expenses)}
              rx={4}
              fill="url(#barExpenses)"
            >
              <title>{formatCurrency(d.expenses)}</title>
            </rect>
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill="#1F2937">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TodayCashRegisterCard({
  paymentBreakdown,
  todayTotal,
  lang,
}: {
  paymentBreakdown: Record<string, number>;
  todayTotal: number;
  lang: string;
}) {
  return (
    <div className="panel p-5 h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <PanelTitle
            icon={<Receipt size={18} className="text-[#6D28D9]" />}
            title={lang === 'sw' ? 'Daftari la Droo ya Mauzo (Till)' : "Today's Register & Till Balancing"}
          />
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#6D28D9]">
            {lang === 'sw' ? 'Kusawazisha Droo' : 'Shift Ledger'}
          </span>
        </div>
        <p className="text-xs text-[#6B7280] mb-4">
          {lang === 'sw'
            ? 'Mgawanyo wa mapato ya fedha taslimu na mitandao ya simu ili kusawazisha droo ya mauzo.'
            : 'Breakdown of cash and mobile money collections to easily balance your drawer at shift end.'}
        </p>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#DCFCE7] text-[#15803D] flex items-center justify-center font-bold text-xs">
                TZS
              </div>
              <div>
                <p className="text-xs font-bold text-[#111827]">
                  {lang === 'sw' ? 'Fedha Taslimu (Cash)' : 'Cash in Hand'}
                </p>
                <p className="text-[10px] text-[#6B7280]">{lang === 'sw' ? 'Droo ya kaunta' : 'Counter cash'}</p>
              </div>
            </div>
            <p className="text-sm font-extrabold text-[#111827]">{formatCurrency(paymentBreakdown.cash || 0)}</p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center font-bold text-xs">
                M
              </div>
              <div>
                <p className="text-xs font-bold text-[#111827]">Vodacom M-Pesa</p>
                <p className="text-[10px] text-[#6B7280]">{lang === 'sw' ? 'Lipa Namba / Simu' : 'Till / Merchant'}</p>
              </div>
            </div>
            <p className="text-sm font-extrabold text-[#111827]">{formatCurrency(paymentBreakdown.mpesa || 0)}</p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] text-[#D97706] flex items-center justify-center font-bold text-xs">
                A
              </div>
              <div>
                <p className="text-xs font-bold text-[#111827]">Airtel Money</p>
                <p className="text-[10px] text-[#6B7280]">{lang === 'sw' ? 'Lipa Namba' : 'Merchant payment'}</p>
              </div>
            </div>
            <p className="text-sm font-extrabold text-[#111827]">{formatCurrency(paymentBreakdown.airtel || 0)}</p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#EDE9FE] text-[#6D28D9] flex items-center justify-center font-bold text-xs">
                <CreditCard size={15} />
              </div>
              <div>
                <p className="text-xs font-bold text-[#111827]">
                  {lang === 'sw' ? 'Kadi / Benki / Nyingine' : 'Card / Bank / Other'}
                </p>
                <p className="text-[10px] text-[#6B7280]">{lang === 'sw' ? 'POS Mashine' : 'Bank settlement'}</p>
              </div>
            </div>
            <p className="text-sm font-extrabold text-[#111827]">
              {formatCurrency((paymentBreakdown.card || 0) + (paymentBreakdown.other || 0))}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[#E5E7EB] flex items-center justify-between">
        <span className="text-xs font-bold text-[#374151]">
          {lang === 'sw' ? 'Jumla ya Makusanyo Leo' : 'Total Collected Today'}
        </span>
        <span className="text-base font-black text-[#6D28D9]">{formatCurrency(todayTotal)}</span>
      </div>
    </div>
  );
}

function TodaySalesStreamCard({
  todaySales,
  lang,
  services,
}: {
  todaySales: Sale[];
  lang: string;
  services: Service[];
}) {
  const svcMap = new Map(services.map((s) => [s.id, s.name]));
  const recentSales = [...todaySales].slice(0, 5);

  return (
    <div className="panel p-5 h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <PanelTitle
            icon={<Zap size={18} className="text-[#6D28D9] fill-[#6D28D9]" />}
            title={lang === 'sw' ? 'Mauzo ya Leo ya Kaunta' : "Today's Counter Sales Stream"}
          />
          <Link
            to="/sales"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#6D28D9] hover:underline"
          >
            <span>{lang === 'sw' ? 'Fungua Mauzo' : 'Open POS'}</span>
            <ArrowRight size={14} />
          </Link>
        </div>
        <p className="text-xs text-[#6B7280] mb-3">
          {lang === 'sw'
            ? 'Orodha ya huduma na risiti zilizotolewa leo kwenye dawati la mapokezi.'
            : 'Live stream of hairstyle services and product orders recorded at the desk today.'}
        </p>

        {recentSales.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6B7280]">
            <Receipt size={28} className="mx-auto mb-2 text-[#9CA3AF]" />
            <p className="font-semibold text-[#374151]">
              {lang === 'sw' ? 'Bado hakuna mauzo yaliyorekodiwa leo' : 'No sales recorded yet today'}
            </p>
            <p className="text-[11px] text-[#6B7280] mt-0.5">
              {lang === 'sw' ? 'Bofya kitufe cha POS kuanza kurekodi' : 'Click the button below to ring up the first customer'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F3F4F6]">
            {recentSales.map((s) => {
              const svcName = (s.service_id && svcMap.get(s.service_id)) || s.hairstyle_name || 'Salon Service';
              const isCash = (s.payment_method || 'cash').toLowerCase().includes('cash');
              return (
                <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#111827] truncate">
                      {s.customer_name || (lang === 'sw' ? 'Mteja wa Saluni' : 'Salon Client')}
                    </p>
                    <p className="text-[11px] text-[#6B7280] truncate">{svcName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-extrabold text-[#111827]">{formatCurrency(saleTotal(s))}</p>
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.2 rounded-full ${
                        isCash ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#EDE9FE] text-[#6D28D9]'
                      }`}
                    >
                      {s.payment_method?.toUpperCase() || 'CASH'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#E5E7EB]">
        <Link
          to="/sales"
          className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#F5F3FF] hover:bg-[#EDE9FE] text-[#6D28D9] font-bold text-xs transition"
        >
          <Scissors size={14} />
          <span>{lang === 'sw' ? '+ Sajili Mauzo Mapya (POS)' : '+ Ring Up Next Client'}</span>
        </Link>
      </div>
    </div>
  );
}

function TodayStylingLogCard({
  todaySales,
  lang,
  services,
}: {
  todaySales: Sale[];
  lang: string;
  services: Service[];
}) {
  const svcMap = new Map(services.map((s) => [s.id, s.name]));
  const recentServices = [...todaySales].slice(0, 5);

  return (
    <div className="panel p-5 h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <PanelTitle
            icon={<Scissors size={18} className="text-[#6D28D9]" />}
            title={lang === 'sw' ? 'Mitindo Iliyofanyika Leo' : "Today's Hairstyles Completed"}
          />
          <Link
            to="/sales"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#6D28D9] hover:underline"
          >
            <span>{lang === 'sw' ? 'Sajili Mtindo' : 'Log Style'}</span>
            <ArrowRight size={14} />
          </Link>
        </div>
        <p className="text-xs text-[#6B7280] mb-3">
          {lang === 'sw'
            ? 'Mitindo ya nywele na huduma zilizokamilika kwa wateja leo.'
            : 'Log of hairstyles and treatments completed on clients today.'}
        </p>

        {recentServices.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6B7280]">
            <Scissors size={28} className="mx-auto mb-2 text-[#9CA3AF]" />
            <p className="font-semibold text-[#374151]">
              {lang === 'sw' ? 'Bado hakuna mitindo iliyosajiliwa leo' : 'No hairstyles recorded yet today'}
            </p>
            <p className="text-[11px] text-[#6B7280] mt-0.5">
              {lang === 'sw' ? 'Bofya kitufe kurekodi huduma uliyomaliza' : 'Click below to log the service you just completed'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F3F4F6]">
            {recentServices.map((s) => {
              const svcName = (s.service_id && svcMap.get(s.service_id)) || s.hairstyle_name || 'Hair Treatment';
              return (
                <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#111827] truncate">{svcName}</p>
                    <p className="text-[11px] text-[#6B7280] truncate">
                      {s.customer_name || (lang === 'sw' ? 'Mteja' : 'Client')} · {s.num_customers}{' '}
                      {s.num_customers === 1 ? 'client' : 'clients'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-extrabold text-[#6D28D9]">{formatCurrency(saleTotal(s))}</p>
                    <span className="text-[10px] font-semibold text-[#15803D]">
                      {lang === 'sw' ? 'Imekamilika' : 'Completed'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#E5E7EB]">
        <Link
          to="/sales"
          className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold text-xs transition"
        >
          <Scissors size={14} />
          <span>{lang === 'sw' ? '+ Rekodi Mtindo Uliomaliza' : '+ Log Finished Hairstyle'}</span>
        </Link>
      </div>
    </div>
  );
}

function StylistSuppliesCard({
  products,
  lang,
}: {
  products: Product[];
  lang: string;
}) {
  const supplies = products.slice(0, 6);
  return (
    <div className="panel p-5 h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <PanelTitle
            icon={<Box size={18} className="text-[#6D28D9]" />}
            title={lang === 'sw' ? 'Akiba ya Dawa & Rasta Stoo' : 'Salon Products & Supplies'}
          />
          <Link
            to="/inventory"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#6D28D9] hover:underline"
          >
            <span>{lang === 'sw' ? 'Angalia Zote' : 'View All'}</span>
            <ArrowRight size={14} />
          </Link>
        </div>
        <p className="text-xs text-[#6B7280] mb-3">
          {lang === 'sw'
            ? 'Upatikanaji wa dawa za nywele, mafuta, shampoos na rasta zilizopo stoo.'
            : 'Track in-salon stock of shampoos, styling creams, relaxers, and braiding hair.'}
        </p>

        {supplies.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#6B7280]">
            <p>{lang === 'sw' ? 'Hakuna bidhaa zilizosajiliwa' : 'No products found'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F3F4F6]">
            {supplies.map((p) => {
              const isOut = p.current_stock <= 0;
              const isLow = p.current_stock > 0 && p.current_stock <= p.low_stock_threshold;
              return (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#111827] truncate">{p.name}</p>
                    <p className="text-[10px] text-[#6B7280]">{p.unit || 'units'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                        isOut
                          ? 'bg-[#FEE2E2] text-[#DC2626]'
                          : isLow
                          ? 'bg-[#FEF3C7] text-[#D97706]'
                          : 'bg-[#DCFCE7] text-[#15803D]'
                      }`}
                    >
                      {p.current_stock} {p.unit || 'pcs'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-[#E5E7EB]">
        <Link
          to="/inventory"
          className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#F5F3FF] hover:bg-[#EDE9FE] text-[#6D28D9] font-bold text-xs transition"
        >
          <Box size={14} />
          <span>{lang === 'sw' ? 'Fungua Orodha ya Stoo' : 'Open Inventory Catalog'}</span>
        </Link>
      </div>
    </div>
  );
}
