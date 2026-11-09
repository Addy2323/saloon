import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Scissors,
  RefreshCw,
  TrendingUp,
  Layers,
  DollarSign,
  CheckCircle2,
  ChevronDown,
  Download,
  Wallet,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, todayISO } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/StatusBadge';
import { exportAuditPDF } from '@/lib/export';
import {
  computeFinancialMetrics,
  getPeriodBounds,
  getSaleNetAmount,
  getSaleOutstandingBalance,
  getSalePaymentStatus,
  isDateInRange,
  type UnifiedPeriodPreset,
} from '@/lib/finance';
import type { Sale, Service, Hairstyle, Staff, Product, Expense, SalePayment, ProductUsage, Customer } from '@/lib/types';

const PAYMENT_METHODS = ['Cash', 'M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Mixx by Yas', 'Bank'];

type LedgerRange = UnifiedPeriodPreset;
type StatusFilter = 'all' | 'completed' | 'pending' | 'unpaid' | 'discounted';
type ConsumedLine = { product_id: string; quantity: number };

function makeOrderRef(id: string, index: number): string {
  const digits = id.replace(/\D/g, '');
  const code = (digits ? digits.slice(-5) : String(22230 + index)).padStart(5, '2');
  return `LBS-${code}`;
}

function formatDMYTime(saleDate: string, createdAt?: string): string {
  const parts = (saleDate || '').slice(0, 10).split('-');
  const dmy = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : saleDate;
  if (createdAt && createdAt.includes('T')) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${dmy} ${hh}:${mm}`;
    }
  }
  return `${dmy} 09:30`;
}

const EMPTY_FORM = () => ({
  service_id: '',
  hairstyle_id: '',
  hairstyle_name: '',
  customer_name: '',
  customer_phone: '',
  num_customers: 1,
  price_per_customer: 0,
  buying_cost: 0,
  consumed: [] as ConsumedLine[],
  discount: 0,
  amount_paid: 0,
  payment_method: 'Cash',
  staff_id: '',
  sale_date: todayISO(),
  notes: '',
});

export function Sales() {
  const { t, lang } = useI18n();
  const { canPerform, user } = useAuth();
  const { notify } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [hairstyles, setHairstyles] = useState<Hairstyle[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [usage, setUsage] = useState<ProductUsage[]>([]);
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);

  // Record Payment (balance settlement) modal
  const [paySale, setPaySale] = useState<Sale | null>(null);
  const [payForm, setPayForm] = useState({ amount: 0, payment_method: 'Cash', payment_date: todayISO(), notes: '' });

  // Digital Sales Ledger filters
  const [range, setRange] = useState<LedgerRange>('all');
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Inline quick cost editing row ID
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineBuyingCost, setInlineBuyingCost] = useState<number>(0);
  const [inlinePricePerCust, setInlinePricePerCust] = useState<number>(0);

  const [form, setForm] = useState(EMPTY_FORM());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [salesRes, servicesRes, hairstylesRes, staffRes, productsRes, expensesRes, usageRes, payRes] =
      await Promise.all([
        supabase
          .from('sales')
          .select('*')
          .order('sale_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('services').select('*').eq('active', true).order('name'),
        supabase.from('hairstyles').select('*').order('name'),
        supabase.from('staff').select('*').eq('active', true).order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('expenses').select('*'),
        supabase.from('product_usage').select('*'),
        supabase.from('sale_payments').select('*').order('created_at', { ascending: false }),
      ]);
    setSales((salesRes.data || []) as Sale[]);
    setServices((servicesRes.data || []) as Service[]);
    setHairstyles((hairstylesRes.data || []) as Hairstyle[]);
    setStaff((staffRes.data || []) as Staff[]);
    setProducts((productsRes.data || []) as Product[]);
    setExpenses((expensesRes.data || []) as Expense[]);
    setUsage((usageRes.data || []) as ProductUsage[]);
    setPayments((payRes.data || []) as SalePayment[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM());
    setShowModal(true);
  };

  const openEdit = (sale: Sale) => {
    setEditing(sale);
    const linked = usage
      .filter((u) => u.sale_id === sale.id)
      .map((u) => ({ product_id: u.product_id, quantity: u.quantity }));
    setForm({
      service_id: sale.service_id || '',
      hairstyle_id: sale.hairstyle_id || '',
      hairstyle_name: sale.hairstyle_name || '',
      customer_name: sale.customer_name || '',
      customer_phone: sale.customer_phone || '',
      num_customers: sale.num_customers,
      price_per_customer: sale.price_per_customer,
      buying_cost: sale.buying_cost || 0,
      consumed: linked,
      discount: sale.discount,
      amount_paid: sale.amount_paid,
      payment_method: sale.payment_method,
      staff_id: sale.staff_id || '',
      sale_date: sale.sale_date,
      notes: sale.notes || '',
    });
    setShowModal(true);
  };

  const onServiceChange = (serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    const price = svc?.default_price || 0;
    setForm((f) => ({
      ...f,
      service_id: serviceId,
      price_per_customer: price,
      amount_paid: Math.max(0, f.num_customers * price - f.discount),
      hairstyle_id: '',
      hairstyle_name: svc?.name || '',
    }));
  };

  const onHairstyleChange = (hsId: string) => {
    const hs = hairstyles.find((h) => h.id === hsId);
    setForm((f) => {
      const price = hs?.default_price || f.price_per_customer;
      return {
        ...f,
        hairstyle_id: hsId,
        hairstyle_name: hs?.name || '',
        price_per_customer: price,
        amount_paid: Math.max(0, f.num_customers * price - f.discount),
      };
    });
  };

  // ---- Consumed products (linked to inventory) ---------------------------
  const consumedCost = (lines: ConsumedLine[]) =>
    lines.reduce((sum, l) => {
      const prd = products.find((p) => p.id === l.product_id);
      return sum + (prd ? prd.unit_cost * (l.quantity || 0) : 0);
    }, 0);

  const updateConsumed = (lines: ConsumedLine[]) => {
    setForm((f) => ({
      ...f,
      consumed: lines,
      buying_cost: lines.some((l) => l.product_id) ? consumedCost(lines) : f.buying_cost,
    }));
  };

  // Stock available for a product inside this form (adds back what this sale already consumed when editing)
  const availableStock = (productId: string) => {
    const prd = products.find((p) => p.id === productId);
    if (!prd) return 0;
    const alreadyLinked = editing
      ? usage.filter((u) => u.sale_id === editing.id && u.product_id === productId).reduce((s, u) => s + u.quantity, 0)
      : 0;
    return (prd.current_stock || 0) + alreadyLinked;
  };

  const updateCustomersOrPrice = (num: number, price: number, disc: number) => {
    const rev = Math.max(0, num * price - disc);
    setForm((f) => ({
      ...f,
      num_customers: num,
      price_per_customer: price,
      discount: disc,
      amount_paid: rev,
    }));
  };

  const totalRevenue = form.num_customers * form.price_per_customer - form.discount;
  const automaticProfit = totalRevenue - (form.buying_cost || 0);
  const balance = totalRevenue - form.amount_paid;

  const resolveCustomerId = async (): Promise<string | null> => {
    const name = form.customer_name.trim();
    const phone = form.customer_phone.trim();
    if (!name || !phone || form.num_customers > 1) return null; // group entries are not split into duplicate customers
    const { data: existing } = await supabase.from('customers').select('*').eq('phone', phone);
    const found = ((existing || []) as Customer[])[0];
    if (found) return found.id;
    const { data: created } = await supabase.from('customers').insert({ name, phone }).select().single();
    return (created as Customer | null)?.id || null;
  };

  const save = async () => {
    if (!form.service_id && !form.hairstyle_name) {
      notify(t('error') + ': ' + t('service'), 'error');
      return;
    }
    if (totalRevenue < 0) {
      notify(lang === 'sw' ? 'Punguzo haliwezi kuzidi jumla ya mauzo' : 'Discount cannot exceed the sale total', 'error');
      return;
    }
    if (form.amount_paid < 0 || form.amount_paid > totalRevenue) {
      notify(lang === 'sw' ? 'Kiasi kilicholipwa si sahihi' : 'Amount paid must be between 0 and the sale total', 'error');
      return;
    }
    const lines = form.consumed.filter((l) => l.product_id && l.quantity > 0);
    for (const l of lines) {
      const need = lines.filter((x) => x.product_id === l.product_id).reduce((s, x) => s + x.quantity, 0);
      if (need > availableStock(l.product_id)) {
        const prd = products.find((p) => p.id === l.product_id);
        notify(
          `${lang === 'sw' ? 'Stoo haitoshi' : 'Insufficient stock'}: ${prd?.name || ''} (${availableStock(l.product_id)} ${prd?.unit || ''})`,
          'error',
        );
        return;
      }
    }

    const buyingCost = lines.length > 0 ? consumedCost(lines) : form.buying_cost || 0;
    const customerId = await resolveCustomerId();
    const base = {
      service_id: form.service_id || null,
      hairstyle_id: form.hairstyle_id || null,
      hairstyle_name: form.hairstyle_name || null,
      customer_id: customerId,
      customer_name: form.customer_name || null,
      customer_phone: form.customer_phone || null,
      num_customers: form.num_customers,
      price_per_customer: form.price_per_customer,
      buying_cost: buyingCost,
      discount: form.discount,
      payment_method: form.payment_method,
      staff_id: form.staff_id || null,
      sale_date: form.sale_date,
      notes: form.notes || null,
    };

    let saleId: string;
    if (editing) {
      const status = getSalePaymentStatus({ ...editing, ...base, amount_paid: form.amount_paid } as Sale);
      const { error } = await supabase
        .from('sales')
        .update({ ...base, amount_paid: form.amount_paid, status })
        .eq('id', editing.id);
      if (error) {
        notify(error.message || t('error'), 'error');
        return;
      }
      saleId = editing.id;
      // Revert previously linked consumption (restores stock) before re-applying
      await supabase.from('product_usage').delete().eq('sale_id', saleId);
    } else {
      const { data, error } = await supabase
        .from('sales')
        .insert({ ...base, amount_paid: 0, status: totalRevenue > 0 ? 'unpaid' : 'completed' })
        .select()
        .single();
      if (error || !data) {
        notify(error?.message || t('error'), 'error');
        return;
      }
      saleId = (data as Sale).id;
      if (form.amount_paid > 0) {
        await supabase.from('sale_payments').insert({
          sale_id: saleId,
          amount: form.amount_paid,
          payment_method: form.payment_method,
          payment_date: form.sale_date,
          recorded_by: user?.name || 'Admin',
          notes: 'Initial payment',
        });
      }
    }

    if (lines.length > 0) {
      await supabase.from('product_usage').insert(
        lines.map((l) => {
          const prd = products.find((p) => p.id === l.product_id);
          return {
            product_id: l.product_id,
            sale_id: saleId,
            quantity: l.quantity,
            unit_cost: prd?.unit_cost || 0,
            usage_type: 'used',
            usage_date: form.sale_date,
            notes: `Consumed in ${form.hairstyle_name || 'service'}`,
          };
        }),
      );
    }

    notify(t('saved'));
    setShowModal(false);
    loadData();
  };

  const saveInlineEdit = async (sale: Sale) => {
    const updated = { ...sale, buying_cost: inlineBuyingCost, price_per_customer: inlinePricePerCust };
    const { error } = await supabase
      .from('sales')
      .update({
        buying_cost: inlineBuyingCost,
        price_per_customer: inlinePricePerCust,
        status: getSalePaymentStatus(updated),
      })
      .eq('id', sale.id);
    if (!error) {
      notify(t('saved'));
      setInlineEditId(null);
      loadData();
    }
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (error) {
      notify(t('error'), 'error');
      return;
    }
    notify(t('deleted'));
    loadData();
  };

  // ---- Record balance payment --------------------------------------------
  const openPay = (sale: Sale) => {
    setPaySale(sale);
    setPayForm({
      amount: getSaleOutstandingBalance(sale),
      payment_method: sale.payment_method || 'Cash',
      payment_date: todayISO(),
      notes: '',
    });
  };

  const savePayment = async () => {
    if (!paySale) return;
    const outstanding = getSaleOutstandingBalance(paySale);
    if (payForm.amount <= 0 || payForm.amount > outstanding) {
      notify(
        lang === 'sw'
          ? `Kiasi lazima kiwe kati ya 1 na ${formatCurrency(outstanding)}`
          : `Amount must be between 1 and ${formatCurrency(outstanding)}`,
        'error',
      );
      return;
    }
    const { error } = await supabase.from('sale_payments').insert({
      sale_id: paySale.id,
      amount: payForm.amount,
      payment_method: payForm.payment_method,
      payment_date: payForm.payment_date,
      recorded_by: user?.name || 'Admin',
      notes: payForm.notes || null,
    });
    if (error) {
      notify(error.message || t('error'), 'error');
      return;
    }
    notify(lang === 'sw' ? 'Malipo yamerekodiwa' : 'Payment recorded');
    setPaySale(null);
    loadData();
  };

  // Filter sales by period range, search, and status
  const bounds = useMemo(() => getPeriodBounds(range, customFrom, customTo), [range, customFrom, customTo]);

  const rangeFilteredSales = useMemo(
    () => sales.filter((s) => isDateInRange(s.sale_date, bounds.start, bounds.end)),
    [sales, bounds],
  );

  const filtered = useMemo(() => {
    return rangeFilteredSales.filter((s, idx) => {
      const refCode = makeOrderRef(s.id, idx + 1);
      const svc = services.find((sv) => sv.id === s.service_id);
      const stf = staff.find((st) => st.id === s.staff_id);
      const pStatus = getSalePaymentStatus(s);

      if (statusFilter === 'completed' && pStatus !== 'completed') return false;
      if (statusFilter === 'pending' && pStatus !== 'partial') return false;
      if (statusFilter === 'unpaid' && pStatus !== 'unpaid') return false;
      if (statusFilter === 'discounted' && (s.discount || 0) <= 0) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          refCode.toLowerCase().includes(q) ||
          (s.customer_name || '').toLowerCase().includes(q) ||
          (s.customer_phone || '').toLowerCase().includes(q) ||
          (s.hairstyle_name || '').toLowerCase().includes(q) ||
          (svc?.name || '').toLowerCase().includes(q) ||
          (stf?.name || '').toLowerCase().includes(q) ||
          (s.payment_method || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rangeFilteredSales, services, staff, statusFilter, search]);

  // Automatic Ledger Totals — powered by the shared financial calculation engine
  const ledgerMetrics = useMemo(() => {
    const m = computeFinancialMetrics({ sales: filtered, expenses: [], products, services });
    return {
      totalBuyingCost: m.salesBuyingCost,
      totalSellingRevenue: m.revenue,
      grossProfit: m.revenue - m.salesBuyingCost,
      totalDiscounts: m.totalDiscounts,
      discountedCount: m.discountedCount,
      missingCostCount: m.missingCostCount,
      completedCount: m.completedCount,
      pendingCount: m.pendingCount,
      cashCollected: m.cashCollected,
      outstanding: m.outstandingBalance,
    };
  }, [filtered, products, services]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedSales = filtered.slice((page - 1) * pageSize, page * pageSize);
  const paySaleHistory = paySale ? payments.filter((p) => p.sale_id === paySale.id) : [];

  const handleExportAuditPDF = () => {
    const periodFrom = range === 'all' ? (filtered[filtered.length - 1]?.sale_date || todayISO()) : bounds.start;
    const periodTo = range === 'all' ? todayISO() : bounds.end;
    const periodOpExpenses = expenses
      .filter((e) => e.expense_date >= periodFrom && e.expense_date <= periodTo)
      .reduce((sum, e) => sum + e.amount, 0);
    const netProfitAfterExp = ledgerMetrics.grossProfit - periodOpExpenses;

    exportAuditPDF({
      reportCode: 'SALES & PROFIT LEDGER AUDIT',
      periodFrom,
      periodTo,
      transactionsBoxTitle: 'TRANSACTIONS',
      transactionsRows: [
        { label: 'Total Count:', value: String(filtered.length), tone: 'default' },
        {
          label: 'Volume / Sales:',
          value: `+TZS ${(ledgerMetrics.totalSellingRevenue + ledgerMetrics.totalDiscounts).toLocaleString('en-US')}`,
          tone: 'teal',
        },
        {
          label: 'Completed Sales:',
          value: `+TZS ${ledgerMetrics.totalSellingRevenue.toLocaleString('en-US')}`,
          tone: 'positive',
        },
        {
          label: 'Discounts / Pending:',
          value: `-TZS ${ledgerMetrics.totalDiscounts.toLocaleString('en-US')}`,
          tone: 'negative',
        },
      ],
      financeBoxTitle: 'FINANCE',
      financeRows: [
        {
          label: 'Sales Revenue:',
          value: `+TZS ${ledgerMetrics.totalSellingRevenue.toLocaleString('en-US')}`,
          tone: 'positive',
        },
        {
          label: 'Product Cost:',
          value: `-TZS ${ledgerMetrics.totalBuyingCost.toLocaleString('en-US')}`,
          tone: 'negative',
        },
        {
          label: 'Gross Profit:',
          value: `+TZS ${ledgerMetrics.grossProfit.toLocaleString('en-US')}`,
          tone: 'default',
        },
        {
          label: 'Operating Expenses:',
          value: `-TZS ${periodOpExpenses.toLocaleString('en-US')}`,
          tone: 'negative',
        },
      ],
      bannerLabel: 'Gross Profit After Discounts & Product Cost',
      bannerValue: `+TZS ${ledgerMetrics.grossProfit.toLocaleString('en-US')}`,
      bannerPositive: ledgerMetrics.grossProfit >= 0,
      metaLine2: `Discounts: TZS ${ledgerMetrics.totalDiscounts.toLocaleString('en-US')}.00 | Orders missing buying cost: ${ledgerMetrics.missingCostCount} | Net Profit After Expenses: TZS ${netProfitAfterExp.toLocaleString('en-US')}`,
      footnote:
        'Figures include all salon service orders created in this period. Gross Profit = Selling Price − Product Buying Cost. Net Profit deducts daily operating expenses.',
      sections: [
        {
          heading: 'SALES LEDGER (TZS)',
          headers: ['Order Date', 'Customer / Service', 'Net sales', 'Net buying cost', 'Gross Profit', 'STATUS'],
          rows: filtered.map((s, idx) => {
            const ref = makeOrderRef(s.id, idx + 1);
            const svc = services.find((sv) => sv.id === s.service_id);
            const net = getSaleNetAmount(s);
            const buy = s.buying_cost || 0;
            const prof = net - buy;
            const bal = getSaleOutstandingBalance(s);
            const dmy = s.sale_date.split('-').reverse().join('/');
            return [
              { primary: ref, secondary: dmy },
              { primary: s.customer_name || 'Walk-in Client', secondary: s.hairstyle_name || svc?.name || 'Service' },
              net.toLocaleString('en-US', { minimumFractionDigits: 2 }),
              buy > 0 ? buy.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'Not recorded',
              buy > 0 ? prof.toLocaleString('en-US', { minimumFractionDigits: 2 }) : net.toLocaleString('en-US', { minimumFractionDigits: 2 }),
              getSalePaymentStatus(s) === 'unpaid' ? 'UNPAID' : bal > 0 ? 'PENDING_BALANCE' : 'COMPLETED',
            ];
          }),
        },
        {
          heading: 'PRODUCT & SERVICE PRICES AT SALE (TZS)',
          headers: ['Order / Service', 'Qty', 'Buying / unit', 'Selling / unit', 'Discount', 'Sale profit'],
          rows: filtered.map((s, idx) => {
            const ref = makeOrderRef(s.id, idx + 1);
            const svc = services.find((sv) => sv.id === s.service_id);
            const net = getSaleNetAmount(s);
            const buy = s.buying_cost || 0;
            const buyUnit = s.num_customers > 0 ? buy / s.num_customers : 0;
            const prof = net - buy;
            return [
              { primary: ref, secondary: s.hairstyle_name || svc?.name || 'Service' },
              s.num_customers,
              buy > 0 ? buyUnit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'Not recorded',
              s.price_per_customer.toLocaleString('en-US', { minimumFractionDigits: 2 }),
              (s.discount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
              prof.toLocaleString('en-US', { minimumFractionDigits: 2 }),
            ];
          }),
        },
      ],
    });
  };

  return (
    <div className="space-y-5">
      {/* =====================================================================
          TOP DARK HERO BANNER — Digital Sales & Profit Ledger
      ===================================================================== */}
      <div className="rounded-2xl sidebar-dotted bg-[#160D24] text-white px-5 py-4.5 border border-[#2d1b4e] shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white flex items-center justify-center shadow-md shrink-0">
            <DollarSign size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
              {lang === 'sw' ? 'Daftari la Mauzo na Faida (Digital Sales Ledger)' : 'Digital Sales Ledger'}
            </h2>
            <p className="text-xs text-white/75 mt-0.5">
              {lang === 'sw'
                ? 'Gharama za bidhaa, bei za huduma na ukokotoaji wa faida otomatiki'
                : 'Buying/product costs, service selling prices & automatic profit calculations'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3.5 py-2 text-xs font-bold text-white transition"
          >
            <RefreshCw size={14} />
            {lang === 'sw' ? 'Onyesha upya' : 'Refresh'}
          </button>
          {canPerform('sales', 'export') && (
            <button
              onClick={handleExportAuditPDF}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-[#D4A24C]/40 px-3.5 py-2 text-xs font-bold text-[#FAE29C] transition"
            >
              <Download size={14} />
              {lang === 'sw' ? 'Pakua PDF' : 'Audit PDF'}
            </button>
          )}
          {canPerform('sales', 'create') && (
            <button onClick={openAdd} className="btn btn-primary py-2 px-4 text-xs">
              <Plus size={16} /> {t('newSale')}
            </button>
          )}
        </div>
      </div>

      {/* =====================================================================
          4 AUTOMATIC PROFIT CALCULATION CARDS
      ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: TOTAL BUYING / PRODUCT COST */}
        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
              {lang === 'sw' ? 'GHARAMA YA BIDHAA (BUYING COST)' : 'TOTAL BUYING / PRODUCT COST'}
            </span>
            <span className="w-7 h-7 rounded-lg bg-[#EDFCF2] text-[#16A34A] flex items-center justify-center">
              <TrendingUp size={15} />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#0F172A] mt-2">
            TZS {ledgerMetrics.totalBuyingCost.toLocaleString('en-US')}
          </p>
          <p className="text-xs text-[#64748B] mt-1">
            {lang === 'sw'
              ? `Jumla ya gharama kwa miamala ${filtered.length}`
              : `Buying/product total across ${filtered.length} recorded orders`}
          </p>
        </div>

        {/* Card 2: TOTAL SELLING PRICE */}
        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
              {lang === 'sw' ? 'JUMLA YA MAUZO (SELLING PRICE)' : 'TOTAL SELLING PRICE'}
            </span>
            <span className="w-7 h-7 rounded-lg bg-[#F1F5F9] text-[#475569] flex items-center justify-center">
              <Layers size={15} />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#0F172A] mt-2">
            TZS {ledgerMetrics.totalSellingRevenue.toLocaleString('en-US')}
          </p>
          <p className="text-xs text-[#64748B] mt-1">
            {lang === 'sw' ? 'Jumla ya mauzo baada ya punguzo' : 'Selling total after discounts'}
          </p>
        </div>

        {/* Card 3: GROSS PROFIT (with green left border accent) */}
        <div className="panel p-5 flex flex-col justify-between border-l-4 border-l-[#16A34A]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#16A34A]">
              {lang === 'sw' ? 'FAIDA GHAFI (GROSS PROFIT)' : 'GROSS PROFIT'}
            </span>
            <span className="w-7 h-7 rounded-lg bg-[#EDFCF2] text-[#16A34A] flex items-center justify-center font-bold text-xs">
              $
            </span>
          </div>
          <p className="text-2xl font-extrabold text-[#16A34A] mt-2">
            TZS {ledgerMetrics.grossProfit.toLocaleString('en-US')}
          </p>
          <p className="text-xs text-[#16A34A] font-medium mt-1">
            {lang === 'sw'
              ? 'Faida halisi baada ya gharama za bidhaa na punguzo'
              : 'Gross profit after product cost and discounts'}
          </p>
        </div>

        {/* Card 4: SERVICE / DELIVERY STATUS */}
        <div className="panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
              {lang === 'sw' ? 'HALI YA HUDUMA NA MALIPO' : 'SERVICE STATUS'}
            </span>
            <span className="w-7 h-7 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
              <CheckCircle2 size={15} />
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-[#0F172A]">{ledgerMetrics.completedCount}</span>
            <span className="text-xs font-extrabold text-[#16A34A] uppercase">COMPLETED</span>
            <span className="text-slate-300">/</span>
            <span className="text-base font-bold text-[#D97706]">{ledgerMetrics.pendingCount}</span>
            <span className="text-xs font-medium text-[#64748B]">Pending</span>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            {lang === 'sw' ? 'Ufanisi wa huduma na malipo' : 'Fulfillment & payment efficiency'}
          </p>
        </div>
      </div>

      {/* =====================================================================
          AUTOMATIC CALCULATION EXPLANATION BANNER
      ===================================================================== */}
      <div className="panel p-4.5 space-y-1.5">
        <p className="text-sm font-extrabold text-[#0F172A]">
          {lang === 'sw' ? 'Punguzo la Bei' : 'Discounts'}: TZS{' '}
          {ledgerMetrics.totalDiscounts.toLocaleString('en-US')} &bull; {ledgerMetrics.discountedCount}{' '}
          {lang === 'sw' ? 'miamala' : 'orders'}
        </p>
        <p className="text-xs text-[#64748B] leading-relaxed">
          {lang === 'sw'
            ? 'Bei zinazoonyeshwa ni jumla ya huduma ikijumuisha idadi ya wateja na punguzo. Gharama ya bidhaa (Buying Price) inatolewa moja kwa moja kwenye Mauzo (Selling Price) ili kupata Faida (Profit) otomatiki.'
            : 'Prices shown are service order totals including customer quantity and discounts. Selling totals are after discounts; product buying costs are automatically deducted from selling price to calculate real-time profit.'}
        </p>
        {ledgerMetrics.missingCostCount > 0 ? (
          <p className="text-xs font-semibold text-[#D97706]">
            {ledgerMetrics.missingCostCount}{' '}
            {lang === 'sw'
              ? 'miamala haina gharama ya bidhaa iliyorekodiwa; bonyeza "Edit" kuweka gharama ya bidhaa.'
              : 'orders have no buying cost recorded; click "Edit" on any row to enter or update product buying cost.'}
          </p>
        ) : (
          <p className="text-xs font-semibold text-[#16A34A]">
            {lang === 'sw'
              ? 'Miamala yote ina gharama za bidhaa na faida imekokotolewa otomatiki.'
              : 'All recorded service orders have buying costs recorded and profit automatically calculated.'}
          </p>
        )}
      </div>

      {/* =====================================================================
          PERIOD PILLS + SEARCH + STATUS DROPDOWN BAR
      ===================================================================== */}
      <div className="panel p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'all', label: lang === 'sw' ? 'Muda Wote' : 'All Time' },
              { id: 'today', label: lang === 'sw' ? 'Leo' : 'Today' },
              { id: 'yesterday', label: lang === 'sw' ? 'Jana' : 'Yesterday' },
              { id: 'thisWeek', label: lang === 'sw' ? 'Wiki Hii' : 'This Week' },
              { id: 'lastWeek', label: lang === 'sw' ? 'Wiki Iliyopita' : 'Last Week' },
              { id: 'thisMonth', label: lang === 'sw' ? 'Mwezi Huu' : 'This Month' },
              { id: 'lastMonth', label: lang === 'sw' ? 'Mwezi Uliopita' : 'Last Month' },
              { id: 'thisYear', label: lang === 'sw' ? 'Mwaka Huu' : 'This Year' },
              { id: 'custom', label: lang === 'sw' ? 'Tarehe Maalum' : 'Custom' },
            ] as { id: LedgerRange; label: string }[]
          ).map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setRange(r.id);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                range === r.id
                  ? 'bg-[#160D24] text-white shadow-xs'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              }`}
            >
              {r.label}
            </button>
          ))}
          {range === 'custom' && (
            <div className="flex items-center gap-1.5 ml-1">
              <input type="date" className="input py-1.5 text-xs w-auto" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }} />
              <span className="text-xs text-[#64748B]">→</span>
              <input type="date" className="input py-1.5 text-xs w-auto" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setPage(1); }} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              className="input pl-9 py-2 text-xs"
              placeholder={lang === 'sw' ? 'Tafuta namba, mteja, mtindo...' : 'Search order #, customer, hairstyle...'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="input w-auto py-2 text-xs font-semibold"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
          >
            <option value="all">{lang === 'sw' ? 'Hali Zote' : 'All Statuses'}</option>
            <option value="completed">{lang === 'sw' ? 'Imekamilika (Completed)' : 'Completed'}</option>
            <option value="pending">{lang === 'sw' ? 'Imelipwa Sehemu (Partial)' : 'Partially Paid'}</option>
            <option value="unpaid">{lang === 'sw' ? 'Haijalipwa (Unpaid)' : 'Unpaid'}</option>
            <option value="discounted">{lang === 'sw' ? 'Yenye Punguzo' : 'Discounted'}</option>
          </select>
        </div>
      </div>

      {/* Pagination Header */}
      <div className="flex items-center justify-end gap-3 text-xs text-[#64748B] font-medium px-1">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="hover:text-[#0F172A] disabled:opacity-40 cursor-pointer"
        >
          Previous
        </button>
        <span className="font-semibold text-[#334155]">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="hover:text-[#0F172A] disabled:opacity-40 cursor-pointer"
        >
          Next
        </button>
      </div>

      {/* =====================================================================
          DIGITAL SALES & AUTOMATIC PROFIT LEDGER TABLE
      ===================================================================== */}
      <div className="panel overflow-hidden border border-[#E2E8F0]">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : paginatedSales.length === 0 ? (
          <EmptyState icon={<Scissors size={32} />} title={t('noData')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#160D24] text-white uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="text-left font-bold px-4 py-3.5">ORDER ID</th>
                  <th className="text-left font-bold px-4 py-3.5">DATE &amp; TIME</th>
                  <th className="text-left font-bold px-4 py-3.5">CUSTOMER</th>
                  <th className="text-left font-bold px-4 py-3.5">PRODUCT / SERVICE ITEMS</th>
                  <th className="text-right font-bold px-4 py-3.5">BUYING COST (TZS)</th>
                  <th className="text-right font-bold px-4 py-3.5">SELLING PRICE (TZS)</th>
                  <th className="text-right font-bold px-4 py-3.5">PROFIT (TZS)</th>
                  <th className="text-left font-bold px-4 py-3.5">STYLIST / STAFF</th>
                  <th className="text-center font-bold px-4 py-3.5">STATUS</th>
                  <th className="text-center font-bold px-4 py-3.5">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {paginatedSales.map((s, idx) => {
                  const refCode = makeOrderRef(s.id, (page - 1) * pageSize + idx + 1);
                  const sellingTotal = getSaleNetAmount(s);
                  const buyingCost = s.buying_cost || 0;
                  const profit = sellingTotal - buyingCost;
                  const bal = getSaleOutstandingBalance(s);
                  const pStatus = getSalePaymentStatus(s);
                  const consumedRows = usage.filter((u) => u.sale_id === s.id);
                  const svc = services.find((sv) => sv.id === s.service_id);
                  const stf = staff.find((st) => st.id === s.staff_id);
                  const isInlineEditing = inlineEditId === s.id;

                  return (
                    <tr key={s.id} className="hover:bg-[#F8FAFC] transition-colors">
                      {/* ORDER ID */}
                      <td className="px-4 py-4 font-extrabold text-[#0F172A] whitespace-nowrap">{refCode}</td>

                      {/* DATE & TIME */}
                      <td className="px-4 py-4 text-[#64748B] whitespace-nowrap">
                        {formatDMYTime(s.sale_date, s.created_at)}
                      </td>

                      {/* CUSTOMER */}
                      <td className="px-4 py-4">
                        <div className="font-bold text-[#0F172A]">{s.customer_name || 'Walk-in Client'}</div>
                        <div className="text-[11px] text-[#94A3B8] mt-0.5">{s.payment_method}</div>
                      </td>

                      {/* PRODUCT / SERVICE ITEMS */}
                      <td className="px-4 py-4">
                        <div className="font-semibold text-[#1E293B]">
                          {s.hairstyle_name || svc?.name || 'Salon Service'}
                        </div>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] text-[10px] font-bold">
                          {s.num_customers} {s.num_customers === 1 ? 'customer' : 'customers'}
                        </span>
                        {consumedRows.length > 0 && (
                          <div className="mt-1 text-[10px] text-[#7C3AED] font-semibold">
                            {consumedRows
                              .map((u) => {
                                const prd = products.find((p) => p.id === u.product_id);
                                return `${prd?.name || 'Product'} ×${u.quantity}`;
                              })
                              .join(', ')}
                          </div>
                        )}
                      </td>

                      {/* BUYING COST (TZS) */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {isInlineEditing ? (
                          <input
                            type="number"
                            min={0}
                            className="input w-28 py-1 px-2 text-right text-xs font-bold ml-auto"
                            value={inlineBuyingCost}
                            onChange={(e) => setInlineBuyingCost(parseFloat(e.target.value) || 0)}
                          />
                        ) : buyingCost > 0 ? (
                          <span className="font-extrabold text-[#334155]">{buyingCost.toLocaleString('en-US')}</span>
                        ) : (
                          <span className="text-[#94A3B8] italic">Not recorded</span>
                        )}
                      </td>

                      {/* SELLING PRICE (TZS) */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {isInlineEditing ? (
                          <input
                            type="number"
                            min={0}
                            className="input w-28 py-1 px-2 text-right text-xs font-bold ml-auto"
                            value={inlinePricePerCust}
                            onChange={(e) => setInlinePricePerCust(parseFloat(e.target.value) || 0)}
                            title="Price per customer"
                          />
                        ) : (
                          <span className="font-semibold text-[#475569]">{sellingTotal.toLocaleString('en-US')}</span>
                        )}
                      </td>

                      {/* AUTOMATIC PROFIT (TZS) */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {isInlineEditing ? (
                          <span className="font-extrabold text-[#16A34A]">
                            {(s.num_customers * inlinePricePerCust - s.discount - (s.refund_amount || 0) - inlineBuyingCost).toLocaleString(
                              'en-US',
                            )}
                          </span>
                        ) : (
                          <span className={`font-extrabold ${profit >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                            {profit.toLocaleString('en-US')}
                          </span>
                        )}
                      </td>

                      {/* STYLIST / STAFF */}
                      <td className="px-4 py-4 text-[#475569] font-semibold uppercase text-[11px]">
                        {stf?.name || 'SALON STAFF'}
                      </td>

                      {/* STATUS */}
                      <td className="px-4 py-4 text-center">
                        {pStatus === 'unpaid' ? (
                          <span className="inline-block px-2.5 py-1 rounded-full bg-[#FEE2E2] text-[#B91C1C] text-[10px] font-bold">
                            Unpaid ({formatCurrency(bal)})
                          </span>
                        ) : bal > 0 ? (
                          <span className="inline-block px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[#B45309] text-[10px] font-bold">
                            Partial · Bal {formatCurrency(bal)}
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#15803D] text-[10px] font-bold">
                            Completed
                          </span>
                        )}
                      </td>

                      {/* ACTIONS */}
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {isInlineEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => saveInlineEdit(s)}
                              className="px-2.5 py-1 rounded-lg bg-[#16A34A] text-white text-[11px] font-bold hover:bg-[#15803D]"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setInlineEditId(null)}
                              className="px-2 py-1 rounded-lg bg-[#F1F5F9] text-[#475569] text-[11px] font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            {bal > 0 && canPerform('sales', 'edit') && (
                              <button
                                onClick={() => openPay(s)}
                                title="Record Payment"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EDE9FE] text-[#6D28D9] hover:bg-[#DDD6FE] text-[11px] font-bold transition"
                              >
                                <Wallet size={12} /> Pay
                              </button>
                            )}
                            {canPerform('sales', 'edit') && (
                              <>
                                <button
                                  onClick={() => {
                                    setInlineEditId(s.id);
                                    setInlineBuyingCost(s.buying_cost || 0);
                                    setInlinePricePerCust(s.price_per_customer);
                                  }}
                                  title="Quick Edit Buying Cost & Price"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#15803D] hover:bg-[#BBF7D0] text-[11px] font-bold transition"
                                >
                                  Edit <ChevronDown size={12} />
                                </button>
                                <button
                                  onClick={() => openEdit(s)}
                                  title="Full Edit Modal"
                                  className="px-2 py-1 rounded-lg bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] text-[11px] font-semibold"
                                >
                                  Details
                                </button>
                              </>
                            )}
                            {canPerform('sales', 'delete') && (
                              <button
                                onClick={() => del(s.id)}
                                className="p-1 text-[#94A3B8] hover:text-[#DC2626] rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Service & Sale Modal with Automatic Profit Calculation */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('edit') : t('newSale')} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('service')}</label>
              <select className="input" value={form.service_id} onChange={(e) => onServiceChange(e.target.value)}>
                <option value="">— {t('service')} —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('hairstyle')}</label>
              <select className="input" value={form.hairstyle_id} onChange={(e) => onHairstyleChange(e.target.value)}>
                <option value="">—</option>
                {hairstyles
                  .filter((h) => !form.service_id || h.service_id === form.service_id)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({formatCurrency(h.default_price)})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('hairstyle')} (Custom / Name)</label>
              <input
                className="input"
                value={form.hairstyle_name}
                onChange={(e) => setForm({ ...form, hairstyle_name: e.target.value })}
                placeholder="Twende Kilioni, Knotless Braids..."
              />
            </div>
            <div>
              <label className="label">{t('customerName')}</label>
              <input
                className="input"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                placeholder="Customer Name or Walk-in"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{lang === 'sw' ? 'Simu ya Mteja (Hiari)' : 'Customer Phone (Optional)'}</label>
              <input
                className="input"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                placeholder="07XXXXXXXX"
              />
            </div>
            <p className="text-[11px] text-[#64748B] self-end pb-2 leading-snug">
              {lang === 'sw'
                ? 'Kwa kundi la wateja (mf. 6 × TSh 15,000) rekodi moja inatosha — hakuna wateja wa nakala watakaoundwa.'
                : 'Group entries (e.g. 6 × TSh 15,000) are stored as one sale — no duplicate customer records are created.'}
            </p>
          </div>

          {/* Selling Price & Customer Count */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">{t('numCustomers')}</label>
              <input
                type="number"
                min={1}
                className="input"
                value={form.num_customers}
                onChange={(e) =>
                  updateCustomersOrPrice(
                    Math.max(1, parseInt(e.target.value) || 1),
                    form.price_per_customer,
                    form.discount,
                  )
                }
              />
            </div>
            <div>
              <label className="label">{t('pricePerCustomer')} (Selling)</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.price_per_customer}
                onChange={(e) =>
                  updateCustomersOrPrice(form.num_customers, parseFloat(e.target.value) || 0, form.discount)
                }
              />
            </div>
            <div>
              <label className="label">{t('discount')}</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.discount}
                onChange={(e) =>
                  updateCustomersOrPrice(form.num_customers, form.price_per_customer, parseFloat(e.target.value) || 0)
                }
              />
            </div>
          </div>

          {/* Product / Buying Cost Section for Automatic Profit Calculation */}
          <div className="rounded-2xl bg-[#F8FAFC] border border-[#CBD5E1] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-wider text-[#334155]">
                {lang === 'sw'
                  ? 'Gharama ya Bidhaa Zilizotumika (Buying / Product Cost)'
                  : 'Product / Buying Cost (For Automatic Profit Calculation)'}
              </p>
              <span className="text-[11px] font-bold text-[#0D9488]">Auto-calculates Profit</span>
            </div>

            <div className="space-y-2">
              {form.consumed.length === 0 && (
                <p className="text-[11px] text-[#64748B]">
                  {lang === 'sw'
                    ? 'Ongeza bidhaa zilizotumika — stoo itapunguzwa na gharama itakokotolewa otomatiki.'
                    : 'Add products consumed — inventory stock is deducted and cost is calculated automatically.'}
                </p>
              )}
              {form.consumed.map((line, i) => {
                const prd = products.find((p) => p.id === line.product_id);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 flex items-center gap-2">
                      {prd?.image_url && (
                        <img
                          src={prd.image_url}
                          alt={prd.name}
                          className="w-7 h-7 rounded-lg object-cover ring-1 ring-[#E5E7EB] shrink-0"
                        />
                      )}
                      <select
                        className="input text-xs flex-1 min-w-0"
                        value={line.product_id}
                        onChange={(e) => {
                          const next = [...form.consumed];
                          next[i] = { ...line, product_id: e.target.value };
                          updateConsumed(next);
                        }}
                      >
                        <option value="">— {lang === 'sw' ? 'Chagua bidhaa' : 'Select product'} —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({formatCurrency(p.unit_cost)} / {p.unit} · {availableStock(p.id)} {lang === 'sw' ? 'zipo' : 'in stock'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="number"
                      min={1}
                      className="input text-xs col-span-2"
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...form.consumed];
                        next[i] = { ...line, quantity: Math.max(1, parseFloat(e.target.value) || 1) };
                        updateConsumed(next);
                      }}
                    />
                    <span className="col-span-3 text-right text-xs font-bold text-[#334155]">
                      {formatCurrency((prd?.unit_cost || 0) * (line.quantity || 0))}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateConsumed(form.consumed.filter((_, j) => j !== i))}
                      className="col-span-1 p-1 text-[#94A3B8] hover:text-[#DC2626]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => updateConsumed([...form.consumed, { product_id: '', quantity: 1 }])}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#6D28D9] hover:underline"
                >
                  <Plus size={13} /> {lang === 'sw' ? 'Ongeza bidhaa iliyotumika' : 'Add consumed product'}
                </button>
                <div className="w-48">
                  <label className="label">
                    {lang === 'sw' ? 'Jumla ya Gharama ya Bidhaa (TZS)' : 'Total Buying / Product Cost (TZS)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={form.consumed.some((l) => l.product_id)}
                    className="input font-bold text-[#0F172A] disabled:bg-[#F1F5F9]"
                    value={form.buying_cost}
                    onChange={(e) => setForm({ ...form, buying_cost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">{t('paymentMethod')}</label>
              <select
                className="input"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('amountPaid')}</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.amount_paid}
                onChange={(e) => setForm({ ...form, amount_paid: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">{t('staff')}</label>
              <select
                className="input"
                value={form.staff_id}
                onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
              >
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('date')}</label>
              <input
                type="date"
                className="input"
                value={form.sale_date}
                onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t('notes')}</label>
              <input
                className="input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          {/* Automatic Revenue & Profit Calculation Summary Box */}
          <div className="rounded-2xl bg-[#F0FDF4] p-4 space-y-2 border border-[#86EFAC]">
            <div className="flex justify-between text-xs text-[#475569]">
              <span>
                Selling Price ({form.num_customers} × {formatCurrency(form.price_per_customer)}
                {form.discount > 0 ? ` − ${formatCurrency(form.discount)}` : ''})
              </span>
              <span className="font-bold text-[#0F172A]">{formatCurrency(totalRevenue)}</span>
            </div>
            <div className="flex justify-between text-xs text-[#475569]">
              <span>− Buying / Product Cost</span>
              <span className="font-bold text-[#DC2626]">− {formatCurrency(form.buying_cost || 0)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-[#86EFAC] pt-2">
              <span className="font-extrabold text-[#1E293B]">
                = {lang === 'sw' ? 'Faida Otomatiki (Gross Profit)' : 'Automatic Gross Profit'}
              </span>
              <span className="font-extrabold text-[#16A34A] text-base">{formatCurrency(automaticProfit)}</span>
            </div>
            {balance > 0 && (
              <div className="flex justify-between text-xs text-[#DC2626] pt-1">
                <span>Unpaid Customer Balance</span>
                <span className="font-bold">{formatCurrency(balance)}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn btn-secondary">
              {t('cancel')}
            </button>
            <button onClick={save} className="btn btn-primary">
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Record Payment / Balance Settlement Modal */}
      <Modal
        open={!!paySale}
        onClose={() => setPaySale(null)}
        title={lang === 'sw' ? 'Rekodi Malipo ya Salio' : 'Record Payment'}
        size="md"
      >
        {paySale && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3">
                <p className="text-[10px] font-bold uppercase text-[#64748B]">{lang === 'sw' ? 'Jumla' : 'Total Sale'}</p>
                <p className="text-sm font-extrabold text-[#0F172A]">{formatCurrency(getSaleNetAmount(paySale))}</p>
              </div>
              <div className="rounded-xl bg-[#F0FDF4] border border-[#86EFAC] p-3">
                <p className="text-[10px] font-bold uppercase text-[#15803D]">{lang === 'sw' ? 'Imelipwa' : 'Amount Paid'}</p>
                <p className="text-sm font-extrabold text-[#15803D]">{formatCurrency(paySale.amount_paid)}</p>
              </div>
              <div className="rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] p-3">
                <p className="text-[10px] font-bold uppercase text-[#B91C1C]">{lang === 'sw' ? 'Salio' : 'Outstanding'}</p>
                <p className="text-sm font-extrabold text-[#B91C1C]">{formatCurrency(getSaleOutstandingBalance(paySale))}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t('amount')}</label>
                <input
                  type="number"
                  min={1}
                  max={getSaleOutstandingBalance(paySale)}
                  className="input font-bold"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="label">{t('paymentMethod')}</label>
                <select
                  className="input"
                  value={payForm.payment_method}
                  onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t('date')}</label>
                <input
                  type="date"
                  className="input"
                  value={payForm.payment_date}
                  onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{t('notes')}</label>
                <input
                  className="input"
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                />
              </div>
            </div>
            {paySaleHistory.length > 0 && (
              <div className="rounded-xl border border-[#E2E8F0] overflow-hidden">
                <p className="px-3 py-2 bg-[#F8FAFC] text-[11px] font-extrabold uppercase text-[#334155]">
                  {lang === 'sw' ? 'Historia ya Malipo' : 'Payment History'}
                </p>
                <ul className="divide-y divide-[#E2E8F0] text-xs">
                  {paySaleHistory.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-3 py-2">
                      <span className="text-[#475569]">
                        {p.payment_date} · {p.payment_method}
                        {p.notes ? ` · ${p.notes}` : ''}
                      </span>
                      <span className="font-bold text-[#15803D]">{formatCurrency(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setPaySale(null)} className="btn btn-secondary">
                {t('cancel')}
              </button>
              <button onClick={savePayment} className="btn btn-primary">
                <Wallet size={15} /> {lang === 'sw' ? 'Hifadhi Malipo' : 'Save Payment'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
