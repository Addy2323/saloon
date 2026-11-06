import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Receipt, Edit3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, todayISO, startOfWeekISO, startOfMonthISO, startOfYearISO } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/StatusBadge';
import type { Expense, Category } from '@/lib/types';

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

export function Expenses() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const [form, setForm] = useState({
    name: '', category_id: '', amount: 0, expense_date: todayISO(), notes: '', recorded_by: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [expRes, catRes] = await Promise.all([
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('categories').select('*').eq('type', 'expense').order('name'),
    ]);
    setExpenses((expRes.data || []) as Expense[]);
    setCategories((catRes.data || []) as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const periodStart = () => {
    switch (period) {
      case 'today': return todayISO();
      case 'week': return startOfWeekISO();
      case 'month': return startOfMonthISO();
      case 'year': return startOfYearISO();
      case 'all': return '1900-01-01';
    }
  };

  const filtered = expenses.filter((e) => {
    const matchesPeriod = e.expense_date >= periodStart();
    const matchesSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.notes?.toLowerCase().includes(search.toLowerCase());
    return matchesPeriod && matchesSearch;
  });

  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0);
  const periodLabels: Record<Period, string> = {
    today: t('today'), week: t('thisWeek'), month: t('thisMonth'), year: t('thisYear'), all: t('allTime'),
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', category_id: '', amount: 0, expense_date: todayISO(), notes: '', recorded_by: '' });
    setShowModal(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      name: e.name, category_id: e.category_id || '', amount: e.amount,
      expense_date: e.expense_date, notes: e.notes || '', recorded_by: e.recorded_by || '',
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name || form.amount <= 0) { notify(t('error'), 'error'); return; }
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      amount: form.amount,
      expense_date: form.expense_date,
      notes: form.notes || null,
      recorded_by: form.recorded_by || null,
    };
    if (editing) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editing.id);
      if (error) { notify(t('error'), 'error'); return; }
    } else {
      const { error } = await supabase.from('expenses').insert(payload);
      if (error) { notify(t('error'), 'error'); return; }
    }
    notify(t('saved'));
    setShowModal(false);
    loadData();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('deleted'));
    loadData();
  };

  const periodButtons: Period[] = ['today', 'week', 'month', 'year', 'all'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{t('expenses')}</h1>
          <p className="text-sm text-ink-500 mt-1">{periodLabels[period]}: <span className="font-semibold text-error-600">{formatCurrency(totalAmount)}</span></p>
        </div>
        <button onClick={openAdd} className="btn btn-primary">
          <Plus size={18} /> {t('newExpense')}
        </button>
      </div>

      {/* Period filter */}
      <div className="flex gap-2 flex-wrap">
        {periodButtons.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`btn text-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Receipt size={32} />} title={t('noData')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500">
                <tr>
                  <th className="text-left font-medium px-4 py-3">{t('expenseName')}</th>
                  <th className="text-left font-medium px-4 py-3">{t('category')}</th>
                  <th className="text-right font-medium px-4 py-3">{t('amount')}</th>
                  <th className="text-left font-medium px-4 py-3">{t('date')}</th>
                  <th className="text-left font-medium px-4 py-3">{t('recordedBy')}</th>
                  <th className="text-center font-medium px-4 py-3">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((e) => {
                  const cat = categories.find((c) => c.id === e.category_id);
                  return (
                    <tr key={e.id} className="hover:bg-ink-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink-800">{e.name}</td>
                      <td className="px-4 py-3">{cat ? <span className="badge bg-ink-100 text-ink-600">{cat.name}</span> : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-error-600">{formatCurrency(e.amount)}</td>
                      <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{formatDate(e.expense_date)}</td>
                      <td className="px-4 py-3 text-ink-500">{e.recorded_by || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(e)} className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                          <button onClick={() => del(e.id)} className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-ink-50 font-semibold">
                  <td colSpan={2} className="px-4 py-3 text-ink-700">{t('total')}</td>
                  <td className="px-4 py-3 text-right text-error-600">{formatCurrency(totalAmount)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('edit') : t('newExpense')} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">{t('expenseName')}</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Umeme, Maji, Kodi..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('category')}</label>
              <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('amount')}</label>
              <input type="number" min={0} className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('expenseDate')}</label>
              <input type="date" className="input" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('recordedBy')}</label>
              <input className="input" value={form.recorded_by} onChange={(e) => setForm({ ...form, recorded_by: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">{t('notes')}</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn btn-secondary">{t('cancel')}</button>
            <button onClick={save} className="btn btn-primary">{t('save')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
