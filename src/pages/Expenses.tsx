import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Receipt, Edit3, Wallet, Calendar, TrendingUp, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  formatCurrency,
  formatDate,
  todayISO,
  startOfWeekISO,
  startOfMonthISO,
  startOfYearISO,
} from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/StatusBadge';
import type { Expense, Category } from '@/lib/types';

type Period = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';
const PAYMENT_METHODS = ['Cash', 'M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Mixx by Yas', 'Bank'];

function startOfQuarterISO(): string {
  const d = new Date();
  const qMonth = Math.floor(d.getMonth() / 3) * 3;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(qMonth + 1)}-01`;
}

export function Expenses() {
  const { t, lang } = useI18n();
  const { notify } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [period, setPeriod] = useState<Period>('month');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const [form, setForm] = useState({
    name: '',
    category_id: '',
    amount: 0,
    expense_date: todayISO(),
    payment_method: 'Cash',
    notes: '',
    recorded_by: 'Admin',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [expRes, catRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('categories').select('*').eq('type', 'expense').order('name'),
    ]);
    setExpenses((expRes.data || []) as Expense[]);
    setCategories((catRes.data || []) as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const periodStart = () => {
    switch (period) {
      case 'today':
        return todayISO();
      case 'week':
        return startOfWeekISO();
      case 'month':
        return startOfMonthISO();
      case 'quarter':
        return startOfQuarterISO();
      case 'year':
        return startOfYearISO();
      case 'all':
        return '1900-01-01';
    }
  };

  const filtered = expenses.filter((e) => {
    const matchesPeriod = e.expense_date >= periodStart();
    const matchesCat = selectedCategory === 'all' || e.category_id === selectedCategory;
    const matchesSearch =
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.notes?.toLowerCase().includes(search.toLowerCase());
    return matchesPeriod && matchesCat && matchesSearch;
  });

  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0);
  const todayExp = expenses.filter((e) => e.expense_date >= todayISO()).reduce((s, e) => s + e.amount, 0);
  const weekExp = expenses.filter((e) => e.expense_date >= startOfWeekISO()).reduce((s, e) => s + e.amount, 0);
  const monthExp = expenses.filter((e) => e.expense_date >= startOfMonthISO()).reduce((s, e) => s + e.amount, 0);

  const periodLabels: Record<Period, string> = {
    today: t('today'),
    week: t('thisWeek'),
    month: t('thisMonth'),
    quarter: lang === 'sw' ? 'Robo Mwaka' : 'Quarterly',
    year: t('thisYear'),
    all: t('allTime'),
  };

  const openAdd = () => {
    setEditing(null);
    setForm({
      name: '',
      category_id: '',
      amount: 0,
      expense_date: todayISO(),
      payment_method: 'Cash',
      notes: '',
      recorded_by: 'Admin',
    });
    setShowModal(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      name: e.name,
      category_id: e.category_id || '',
      amount: e.amount,
      expense_date: e.expense_date,
      payment_method: e.payment_method || 'Cash',
      notes: e.notes || '',
      recorded_by: e.recorded_by || 'Admin',
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name || form.amount <= 0) {
      notify(t('error'), 'error');
      return;
    }
    const noteText =
      form.payment_method && (!form.notes || !form.notes.includes(form.payment_method))
        ? `${form.payment_method}${form.notes ? ` · ${form.notes}` : ''}`
        : form.notes;
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      amount: form.amount,
      expense_date: form.expense_date,
      payment_method: form.payment_method || null,
      notes: noteText || null,
      recorded_by: form.recorded_by || null,
    };
    if (editing) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editing.id);
      if (error) {
        notify(t('error'), 'error');
        return;
      }
    } else {
      const { error } = await supabase.from('expenses').insert(payload);
      if (error) {
        notify(t('error'), 'error');
        return;
      }
    }
    notify(t('saved'));
    setShowModal(false);
    loadData();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) {
      notify(t('error'), 'error');
      return;
    }
    notify(t('deleted'));
    loadData();
  };

  const periodButtons: Period[] = ['today', 'week', 'month', 'quarter', 'year', 'all'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-ink-900">{t('expenses')}</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            {lang === 'sw'
              ? 'Fuatilia gharama za uendeshaji wa saluni kwa siku, wiki, mwezi na mwaka'
              : 'Track daily, weekly, monthly, quarterly, and annual operating expenses'}
          </p>
        </div>
        <button onClick={openAdd} className="btn btn-primary">
          <Plus size={18} /> {t('newExpense')}
        </button>
      </div>

      {/* 4 KPI Cards — White with soft grey borders and subtle shadows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FDFAEF] border border-[#F4DE9E] text-[#B8862D] flex items-center justify-center shrink-0">
            <Receipt size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{t('expensesToday')}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{formatCurrency(todayExp)}</p>
            <p className="mt-1 text-xs text-[#B8862D] font-semibold">{t('today')}</p>
          </div>
        </div>

        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] flex items-center justify-center shrink-0">
            <Calendar size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{t('thisWeek')}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{formatCurrency(weekExp)}</p>
            <p className="mt-1 text-xs text-[#6D28D9] font-semibold">7 {lang === 'sw' ? 'siku' : 'days'}</p>
          </div>
        </div>

        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] flex items-center justify-center shrink-0">
            <Wallet size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{t('thisMonth')}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{formatCurrency(monthExp)}</p>
            <p className="mt-1 text-xs text-[#D97706] font-semibold">{t('totalExpenses')}</p>
          </div>
        </div>

        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#EDFCF2] border border-[#AAEFC6] text-[#098F50] flex items-center justify-center shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{periodLabels[period]}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{formatCurrency(totalAmount)}</p>
            <p className="mt-1 text-xs text-[#098F50] font-semibold">
              {filtered.length} {t('items')}
            </p>
          </div>
        </div>
      </div>

      {/* Period & Category Filters + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 flex-wrap bg-white p-1 rounded-xl border border-[#ece8f5]">
          {periodButtons.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === p ? 'bg-[#6d28d9] text-white shadow-sm' : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
          <div className="relative">
            <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input pl-8 pr-8 w-auto text-xs font-medium"
            >
              <option value="all">{lang === 'sw' ? 'Kategoria Zote' : 'All Categories'}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="relative flex-1 sm:w-64">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input pl-9"
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Receipt size={32} />} title={t('noData')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f6fc] text-ink-500 border-b border-[#ece8f5]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3.5">{t('expenseName')}</th>
                  <th className="text-left font-semibold px-4 py-3.5">{t('category')}</th>
                  <th className="text-right font-semibold px-4 py-3.5">{t('amount')}</th>
                  <th className="text-left font-semibold px-4 py-3.5">{t('date')}</th>
                  <th className="text-left font-semibold px-4 py-3.5">{t('notes')}</th>
                  <th className="text-left font-semibold px-4 py-3.5">{t('recordedBy')}</th>
                  <th className="text-center font-semibold px-4 py-3.5">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1edf8]">
                {filtered.map((e) => {
                  const cat = categories.find((c) => c.id === e.category_id);
                  return (
                    <tr key={e.id} className="hover:bg-[#faf8fe] transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-ink-900">{e.name}</td>
                      <td className="px-4 py-3.5">
                        {cat ? (
                          <span className="badge bg-[#fff1e6] text-[#ea6c0a]">{cat.name}</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-error-600">{formatCurrency(e.amount)}</td>
                      <td className="px-4 py-3.5 text-ink-600 whitespace-nowrap">{formatDate(e.expense_date)}</td>
                      <td className="px-4 py-3.5 text-ink-500 text-xs">{e.notes || '—'}</td>
                      <td className="px-4 py-3.5 text-ink-600">{e.recorded_by || 'Admin'}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(e)}
                            className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => del(e.id)}
                            className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#f8f6fc] border-t border-[#ece8f5] font-extrabold">
                  <td colSpan={2} className="px-4 py-3.5 text-ink-900">
                    {t('total')}
                  </td>
                  <td className="px-4 py-3.5 text-right text-error-600">{formatCurrency(totalAmount)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Expense Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('edit') : t('newExpense')} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">{t('expenseName')}</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Electricity, Water, Waste Collection, Rent..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('category')}</label>
              <select
                className="input"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">—</option>
                {categories
                  .filter((c) => (c.status || 'active') === 'active' || c.id === form.category_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label">{t('amount')}</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">{t('expenseDate')}</label>
              <input
                type="date"
                className="input"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </div>
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
              <label className="label">{t('recordedBy')}</label>
              <input
                className="input"
                value={form.recorded_by}
                onChange={(e) => setForm({ ...form, recorded_by: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">{t('notes')}</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional description or receipt reference..."
            />
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
    </div>
  );
}
