import { useEffect, useState, useCallback } from 'react';
import { FileBarChart, Download, FileSpreadsheet, TrendingUp, TrendingDown, Wallet, Scissors, Package, Receipt, ShoppingCart, Percent } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, todayISO, startOfMonthISO } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { BarChart } from '@/components/Charts';
import { exportCSV, exportPDF } from '@/lib/export';
import type { Sale, Expense, Product, PurchaseItem, ProductUsage } from '@/lib/types';

type ReportType = 'sales' | 'expenses' | 'profit' | 'stock' | 'purchases' | 'services';

export function Reports() {
  const { t } = useI18n();
  const [reportType, setReportType] = useState<ReportType>('profit');
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);

    if (reportType === 'stock') {
      const { data: products } = await supabase.from('products').select('*, categories(name)').order('name');
      setData({ products: products || [] });
      setLoading(false);
      return;
    }

    const [salesRes, expensesRes] = await Promise.all([
      supabase.from('sales').select('*, services(name), staff(name)').gte('sale_date', from).lte('sale_date', to).order('sale_date', { ascending: false }),
      supabase.from('expenses').select('*, categories(name)').gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false }),
    ]);

    const sales = (salesRes.data || []) as (Sale & { services: { name: string } | null; staff: { name: string } | null })[];
    const expenses = (expensesRes.data || []) as (Expense & { categories: { name: string } | null })[];

    const [usageRes, purchItemsRes, purchasesRes] = await Promise.all([
      supabase.from('product_usage').select('*, products(name, unit_cost)').gte('usage_date', from).lte('usage_date', to),
      supabase.from('purchase_items').select('*, products(name)').gte('created_at', from + 'T00:00:00').lte('created_at', to + 'T23:59:59'),
      supabase.from('purchases').select('*, suppliers(name)').gte('purchase_date', from).lte('purchase_date', to).order('purchase_date', { ascending: false }),
    ]);

    const usage = (usageRes.data || []) as (ProductUsage & { products: { name: string; unit_cost: number } | null })[];
    const purchItems = (purchItemsRes.data || []) as (PurchaseItem & { products: { name: string } | null })[];
    const purchases = (purchasesRes.data || []) as any[];

    const revenue = sales.reduce((s, sale) => s + (sale.num_customers * sale.price_per_customer - sale.discount), 0);
    const operatingExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const productCost = usage.reduce((s, u) => s + u.quantity * (u.products?.unit_cost || 0), 0);
    const purchaseTotal = purchases.reduce((s: number, p) => s + p.total_amount, 0);
    const netProfit = revenue - operatingExpenses - productCost;

    // Service performance
    const servicePerf: Record<string, { count: number; revenue: number }> = {};
    sales.forEach((s) => {
      const name = s.services?.name || s.hairstyle_name || 'Unknown';
      const total = s.num_customers * s.price_per_customer - s.discount;
      if (!servicePerf[name]) servicePerf[name] = { count: 0, revenue: 0 };
      servicePerf[name].count += s.num_customers;
      servicePerf[name].revenue += total;
    });

    // Daily revenue for chart
    const dailyMap: Record<string, number> = {};
    sales.forEach((s) => {
      const total = s.num_customers * s.price_per_customer - s.discount;
      dailyMap[s.sale_date] = (dailyMap[s.sale_date] || 0) + total;
    });
    const dailyData = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, val]) => ({ label: formatDate(date).slice(0, 6), value: val }));

    setData({
      sales, expenses, usage, purchItems, purchases,
      revenue, operatingExpenses, productCost, purchaseTotal, netProfit,
      servicePerf, dailyData,
    });
    setLoading(false);
  }, [reportType, from, to]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const reportTypes: { type: ReportType; icon: typeof FileBarChart; key: string }[] = [
    { type: 'profit', icon: Wallet, key: 'profitLoss' },
    { type: 'sales', icon: Scissors, key: 'dailySalesReport' },
    { type: 'services', icon: TrendingUp, key: 'servicePerformance' },
    { type: 'expenses', icon: Receipt, key: 'expensesReport' },
    { type: 'stock', icon: Package, key: 'stockReport' },
    { type: 'purchases', icon: ShoppingCart, key: 'purchasesReport' },
  ];

  const handleExportExcel = () => {
    if (reportType === 'profit') {
      exportCSV('profit-loss-report', [t('revenue'), t('operatingExpenses'), t('costOfProducts'), t('netProfit')], [
        [formatCurrency(data.revenue), formatCurrency(data.operatingExpenses), formatCurrency(data.productCost), formatCurrency(data.netProfit)],
      ]);
    } else if (reportType === 'sales') {
      exportCSV('sales-report', [t('date'), t('hairstyle'), t('customerName'), t('numCustomers'), t('pricePerCustomer'), t('discount'), t('totalRevenue'), t('paymentMethod')], 
        data.sales.map((s: Sale & { services: { name: string } | null; staff: { name: string } | null }) => [
          formatDate(s.sale_date), s.hairstyle_name || s.services?.name || '', s.customer_name || '',
          s.num_customers, formatCurrency(s.price_per_customer), formatCurrency(s.discount),
          formatCurrency(s.num_customers * s.price_per_customer - s.discount), s.payment_method,
        ]));
    } else if (reportType === 'expenses') {
      exportCSV('expenses-report', [t('expenseName'), t('category'), t('amount'), t('date'), t('recordedBy')], 
        data.expenses.map((e: Expense & { categories: { name: string } | null }) => [
          e.name, e.categories?.name || '', formatCurrency(e.amount), formatDate(e.expense_date), e.recorded_by || '',
        ]));
    } else if (reportType === 'stock') {
      exportCSV('stock-report', [t('productName'), t('category'), t('unitCost'), t('currentStock'), t('lowStockThreshold')], 
        data.products.map((p: Product & { categories: { name: string } | null }) => [
          p.name, p.categories?.name || '', formatCurrency(p.unit_cost), p.current_stock, p.low_stock_threshold,
        ]));
    } else if (reportType === 'services') {
      exportCSV('service-performance', [t('service'), t('customers'), t('revenue')], 
        Object.entries(data.servicePerf).map(([name, info]: [string, any]) => [name, info.count, formatCurrency(info.revenue)]));
    } else if (reportType === 'purchases') {
      exportCSV('purchases-report', [t('date'), t('supplier'), t('grandTotal')], 
        data.purchases.map((p: any) => [formatDate(p.purchase_date), p.suppliers?.name || '', formatCurrency(p.total_amount)]));
    }
  };

  const handleExportPDF = () => {
    if (reportType === 'profit') {
      exportPDF('Profit & Loss Report', [], [
        { label: t('revenue'), value: formatCurrency(data.revenue) },
        { label: t('operatingExpenses'), value: formatCurrency(data.operatingExpenses) },
        { label: t('costOfProducts'), value: formatCurrency(data.productCost) },
        { label: t('netProfit'), value: formatCurrency(data.netProfit) },
      ]);
    } else if (reportType === 'sales') {
      exportPDF('Sales Report', [{
        heading: t('dailySalesReport'),
        headers: [t('date'), t('hairstyle'), t('customerName'), t('numCustomers'), t('totalRevenue'), t('paymentMethod')],
        rows: data.sales.map((s: Sale & { services: { name: string } | null }) => [
          formatDate(s.sale_date), s.hairstyle_name || s.services?.name || '', s.customer_name || '',
          s.num_customers, formatCurrency(s.num_customers * s.price_per_customer - s.discount), s.payment_method,
        ]),
      }], [{ label: t('totalRevenue'), value: formatCurrency(data.revenue) }]);
    } else if (reportType === 'expenses') {
      exportPDF('Expenses Report', [{
        heading: t('expensesReport'),
        headers: [t('expenseName'), t('category'), t('amount'), t('date')],
        rows: data.expenses.map((e: Expense & { categories: { name: string } | null }) => [
          e.name, e.categories?.name || '', formatCurrency(e.amount), formatDate(e.expense_date),
        ]),
      }], [{ label: t('total'), value: formatCurrency(data.operatingExpenses) }]);
    } else if (reportType === 'stock') {
      exportPDF('Stock Report', [{
        heading: t('stockReport'),
        headers: [t('productName'), t('category'), t('unitCost'), t('currentStock')],
        rows: data.products.map((p: Product & { categories: { name: string } | null }) => [
          p.name, p.categories?.name || '', formatCurrency(p.unit_cost), String(p.current_stock),
        ]),
      }]);
    } else if (reportType === 'services') {
      exportPDF('Service Performance Report', [{
        heading: t('servicePerformance'),
        headers: [t('service'), t('customers'), t('revenue')],
        rows: Object.entries(data.servicePerf).map(([name, info]: [string, any]) => [
          name, String(info.count), formatCurrency(info.revenue),
        ]),
      }]);
    } else if (reportType === 'purchases') {
      exportPDF('Purchases Report', [{
        heading: t('purchasesReport'),
        headers: [t('date'), t('supplier'), t('grandTotal')],
        rows: data.purchases.map((p: any) => [
          formatDate(p.purchase_date), p.suppliers?.name || '', formatCurrency(p.total_amount),
        ]),
      }], [{ label: t('total'), value: formatCurrency(data.purchaseTotal) }]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{t('reports')}</h1>
        <p className="text-sm text-ink-500 mt-1">{t('selectPeriod')}</p>
      </div>

      {/* Report type selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {reportTypes.map((rt) => {
          const Icon = rt.icon;
          const isActive = reportType === rt.type;
          return (
            <button
              key={rt.type}
              onClick={() => setReportType(rt.type)}
              className={`card p-4 flex flex-col items-center gap-2 transition-all ${
                isActive ? 'ring-2 ring-primary-400 bg-primary-50' : 'hover:shadow-glow'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? 'bg-primary-500 text-white' : 'bg-ink-100 text-ink-500'}`}>
                <Icon size={20} />
              </div>
              <span className={`text-xs font-medium text-center ${isActive ? 'text-primary-700' : 'text-ink-600'}`}>{t(rt.key)}</span>
            </button>
          );
        })}
      </div>

      {/* Date filter + export buttons */}
      {reportType !== 'stock' && (
        <div className="card p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="label">{t('from')}</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('to')}</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex-1" />
          <button onClick={handleExportExcel} className="btn btn-secondary">
            <FileSpreadsheet size={18} /> {t('exportExcel')}
          </button>
          <button onClick={handleExportPDF} className="btn btn-primary">
            <Download size={18} /> {t('exportPdf')}
          </button>
        </div>
      )}

      {reportType === 'stock' && (
        <div className="card p-4 flex justify-end">
          <button onClick={handleExportExcel} className="btn btn-secondary mr-2"><FileSpreadsheet size={18} /> {t('exportExcel')}</button>
          <button onClick={handleExportPDF} className="btn btn-primary"><Download size={18} /> {t('exportPdf')}</button>
        </div>
      )}

      {/* Report content */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>
      ) : (
        <ReportContent reportType={reportType} data={data} t={t} />
      )}
    </div>
  );
}

function ReportContent({ reportType, data, t }: { reportType: ReportType; data: any; t: (k: string) => string }) {
  if (!data) return null;

  if (reportType === 'profit') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard icon={<TrendingUp size={20} />} label={t('revenue')} value={formatCurrency(data.revenue)} color="primary" />
          <SummaryCard icon={<Receipt size={20} />} label={t('operatingExpenses')} value={formatCurrency(data.operatingExpenses)} color="error" />
          <SummaryCard icon={<Package size={20} />} label={t('costOfProducts')} value={formatCurrency(data.productCost)} color="warning" />
          <SummaryCard icon={<Wallet size={20} />} label={t('netProfit')} value={formatCurrency(data.netProfit)} color={data.netProfit >= 0 ? 'success' : 'error'} />
        </div>
        {data.dailyData.length > 0 && (
          <div className="card p-5">
            <h3 className="font-semibold text-ink-900 mb-4">{t('dailySalesReport')}</h3>
            <BarChart data={data.dailyData} color="#e04b72" height={220} />
          </div>
        )}
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-3">{t('profitLoss')}</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-ink-100">
              <span className="text-ink-600">{t('revenue')}</span>
              <span className="font-semibold text-success-600">{formatCurrency(data.revenue)}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-ink-100">
              <span className="text-ink-600">− {t('operatingExpenses')}</span>
              <span className="font-semibold text-error-600">{formatCurrency(data.operatingExpenses)}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-ink-100">
              <span className="text-ink-600">− {t('costOfProducts')}</span>
              <span className="font-semibold text-error-600">{formatCurrency(data.productCost)}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-lg font-bold text-ink-900">{t('netProfit')}</span>
              <span className={`text-lg font-bold ${data.netProfit >= 0 ? 'text-success-600' : 'text-error-600'}`}>{formatCurrency(data.netProfit)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (reportType === 'sales') {
    return (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">{t('date')}</th>
                <th className="text-left font-medium px-4 py-3">{t('hairstyle')}</th>
                <th className="text-left font-medium px-4 py-3">{t('customerName')}</th>
                <th className="text-center font-medium px-4 py-3">{t('numCustomers')}</th>
                <th className="text-right font-medium px-4 py-3">{t('totalRevenue')}</th>
                <th className="text-left font-medium px-4 py-3">{t('paymentMethod')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.sales.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-ink-400">{t('noData')}</td></tr>
              ) : data.sales.map((s: Sale & { services: { name: string } | null }) => (
                <tr key={s.id} className="hover:bg-ink-50/50">
                  <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{formatDate(s.sale_date)}</td>
                  <td className="px-4 py-3 font-medium text-ink-800">{s.hairstyle_name || s.services?.name || '—'}</td>
                  <td className="px-4 py-3 text-ink-600">{s.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-center text-ink-600">{s.num_customers}</td>
                  <td className="px-4 py-3 text-right font-semibold text-success-600">{formatCurrency(s.num_customers * s.price_per_customer - s.discount)}</td>
                  <td className="px-4 py-3"><span className="badge bg-secondary-100 text-secondary-700">{s.payment_method}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (reportType === 'services') {
    const entries = Object.entries(data.servicePerf).sort((a, b) => b[1].revenue - a[1].revenue);
    return (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="text-left font-medium px-4 py-3">{t('service')}</th>
              <th className="text-center font-medium px-4 py-3">{t('customers')}</th>
              <th className="text-right font-medium px-4 py-3">{t('revenue')}</th>
              <th className="text-right font-medium px-4 py-3">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {entries.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-ink-400">{t('noData')}</td></tr>
            ) : entries.map(([name, info]: [string, any]) => {
              const pct = data.revenue > 0 ? (info.revenue / data.revenue) * 100 : 0;
              return (
                <tr key={name} className="hover:bg-ink-50/50">
                  <td className="px-4 py-3 font-medium text-ink-800">{name}</td>
                  <td className="px-4 py-3 text-center text-ink-600">{info.count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-success-600">{formatCurrency(info.revenue)}</td>
                  <td className="px-4 py-3 text-right text-ink-500">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (reportType === 'expenses') {
    return (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">{t('expenseName')}</th>
                <th className="text-left font-medium px-4 py-3">{t('category')}</th>
                <th className="text-right font-medium px-4 py-3">{t('amount')}</th>
                <th className="text-left font-medium px-4 py-3">{t('date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.expenses.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-ink-400">{t('noData')}</td></tr>
              ) : data.expenses.map((e: Expense & { categories: { name: string } | null }) => (
                <tr key={e.id} className="hover:bg-ink-50/50">
                  <td className="px-4 py-3 font-medium text-ink-800">{e.name}</td>
                  <td className="px-4 py-3">{e.categories?.name ? <span className="badge bg-ink-100 text-ink-600">{e.categories.name}</span> : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-error-600">{formatCurrency(e.amount)}</td>
                  <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{formatDate(e.expense_date)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50 font-semibold">
                <td colSpan={2} className="px-4 py-3 text-ink-700">{t('total')}</td>
                <td className="px-4 py-3 text-right text-error-600">{formatCurrency(data.operatingExpenses)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  if (reportType === 'stock') {
    return (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">{t('productName')}</th>
                <th className="text-left font-medium px-4 py-3">{t('category')}</th>
                <th className="text-right font-medium px-4 py-3">{t('unitCost')}</th>
                <th className="text-center font-medium px-4 py-3">{t('currentStock')}</th>
                <th className="text-right font-medium px-4 py-3">{t('total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.products.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-ink-400">{t('noData')}</td></tr>
              ) : data.products.map((p: Product & { categories: { name: string } | null }) => (
                <tr key={p.id} className="hover:bg-ink-50/50">
                  <td className="px-4 py-3 font-medium text-ink-800">{p.name}</td>
                  <td className="px-4 py-3 text-ink-600">{p.categories?.name || '—'}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{formatCurrency(p.unit_cost)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={p.current_stock <= p.low_stock_threshold ? 'text-warning-600 font-semibold' : 'text-ink-700'}>
                      {p.current_stock} {p.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink-800">{formatCurrency(p.current_stock * p.unit_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (reportType === 'purchases') {
    return (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="text-left font-medium px-4 py-3">{t('date')}</th>
                <th className="text-left font-medium px-4 py-3">{t('supplier')}</th>
                <th className="text-right font-medium px-4 py-3">{t('grandTotal')}</th>
                <th className="text-left font-medium px-4 py-3">{t('notes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.purchases.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-ink-400">{t('noData')}</td></tr>
              ) : data.purchases.map((p: any) => (
                <tr key={p.id} className="hover:bg-ink-50/50">
                  <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{formatDate(p.purchase_date)}</td>
                  <td className="px-4 py-3 font-medium text-ink-800">{p.suppliers?.name || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink-800">{formatCurrency(p.total_amount)}</td>
                  <td className="px-4 py-3 text-ink-500">{p.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-50 font-semibold">
                <td colSpan={2} className="px-4 py-3 text-ink-700">{t('total')}</td>
                <td className="px-4 py-3 text-right text-ink-800">{formatCurrency(data.purchaseTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  return null;
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: 'primary' | 'error' | 'warning' | 'success' }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-600',
    error: 'bg-error-50 text-error-600',
    warning: 'bg-warning-50 text-warning-600',
    success: 'bg-success-50 text-success-600',
  };
  return (
    <div className="card p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>{icon}</div>
      <p className="text-xs text-ink-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-ink-900">{value}</p>
    </div>
  );
}
