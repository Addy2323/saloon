import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Scissors, Edit3, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, todayISO } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/StatusBadge';
import type { Sale, Service, Hairstyle, Staff } from '@/lib/types';

const PAYMENT_METHODS = ['Cash', 'M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Mixx by Yas', 'Bank'];

export function Sales() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [hairstyles, setHairstyles] = useState<Hairstyle[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const [form, setForm] = useState({
    service_id: '',
    hairstyle_id: '',
    hairstyle_name: '',
    customer_name: '',
    num_customers: 1,
    price_per_customer: 0,
    discount: 0,
    amount_paid: 0,
    payment_method: 'Cash',
    staff_id: '',
    sale_date: todayISO(),
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [salesRes, servicesRes, hairstylesRes, staffRes] = await Promise.all([
      supabase.from('sales').select('*').order('sale_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('services').select('*').eq('active', true).order('name'),
      supabase.from('hairstyles').select('*').order('name'),
      supabase.from('staff').select('*').eq('active', true).order('name'),
    ]);
    setSales((salesRes.data || []) as Sale[]);
    setServices((servicesRes.data || []) as Service[]);
    setHairstyles((hairstylesRes.data || []) as Hairstyle[]);
    setStaff((staffRes.data || []) as Staff[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      service_id: '', hairstyle_id: '', hairstyle_name: '', customer_name: '',
      num_customers: 1, price_per_customer: 0, discount: 0, amount_paid: 0,
      payment_method: 'Cash', staff_id: '', sale_date: todayISO(), notes: '',
    });
    setShowModal(true);
  };

  const openEdit = (sale: Sale) => {
    setEditing(sale);
    setForm({
      service_id: sale.service_id || '',
      hairstyle_id: sale.hairstyle_id || '',
      hairstyle_name: sale.hairstyle_name || '',
      customer_name: sale.customer_name || '',
      num_customers: sale.num_customers,
      price_per_customer: sale.price_per_customer,
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
    setForm((f) => ({
      ...f,
      service_id: serviceId,
      price_per_customer: svc?.default_price || 0,
      hairstyle_id: '',
      hairstyle_name: '',
    }));
  };

  const onHairstyleChange = (hsId: string) => {
    const hs = hairstyles.find((h) => h.id === hsId);
    setForm((f) => ({
      ...f,
      hairstyle_id: hsId,
      hairstyle_name: hs?.name || '',
      price_per_customer: hs?.default_price || f.price_per_customer,
    }));
  };

  const totalRevenue = form.num_customers * form.price_per_customer - form.discount;
  const balance = totalRevenue - form.amount_paid;

  const save = async () => {
    if (!form.service_id) {
      notify(t('error') + ': ' + t('service'), 'error');
      return;
    }
    const payload = {
      service_id: form.service_id || null,
      hairstyle_id: form.hairstyle_id || null,
      hairstyle_name: form.hairstyle_name || null,
      customer_name: form.customer_name || null,
      num_customers: form.num_customers,
      price_per_customer: form.price_per_customer,
      discount: form.discount,
      amount_paid: form.amount_paid,
      payment_method: form.payment_method,
      staff_id: form.staff_id || null,
      sale_date: form.sale_date,
      notes: form.notes || null,
    };

    if (editing) {
      const { error } = await supabase.from('sales').update(payload).eq('id', editing.id);
      if (error) { notify(t('error'), 'error'); return; }
      notify(t('saved'));
    } else {
      const { error } = await supabase.from('sales').insert(payload);
      if (error) { notify(t('error'), 'error'); return; }
      notify(t('saved'));
    }
    setShowModal(false);
    loadData();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('deleted'));
    loadData();
  };

  const filtered = sales.filter((s) => {
    const matchesSearch = !search ||
      s.hairstyle_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchesDate = !filterDate || s.sale_date === filterDate;
    return matchesSearch && matchesDate;
  });

  const todayTotal = sales
    .filter((s) => s.sale_date === todayISO())
    .reduce((sum, s) => sum + (s.num_customers * s.price_per_customer - s.discount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{t('sales')}</h1>
          <p className="text-sm text-ink-500 mt-1">{t('salesToday')}: <span className="font-semibold text-success-600">{formatCurrency(todayTotal)}</span></p>
        </div>
        <button onClick={openAdd} className="btn btn-primary">
          <Plus size={18} /> {t('newSale')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <input type="date" className="input w-auto" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        {filterDate && <button onClick={() => setFilterDate('')} className="btn btn-ghost"><X size={16} /></button>}
      </div>

      {/* Sales list */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Scissors size={32} />} title={t('noData')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500">
                <tr>
                  <th className="text-left font-medium px-4 py-3">{t('date')}</th>
                  <th className="text-left font-medium px-4 py-3">{t('hairstyle')}</th>
                  <th className="text-left font-medium px-4 py-3">{t('customerName')}</th>
                  <th className="text-center font-medium px-4 py-3">{t('numCustomers')}</th>
                  <th className="text-right font-medium px-4 py-3">{t('pricePerCustomer')}</th>
                  <th className="text-right font-medium px-4 py-3">{t('totalRevenue')}</th>
                  <th className="text-left font-medium px-4 py-3">{t('paymentMethod')}</th>
                  <th className="text-right font-medium px-4 py-3">{t('balance')}</th>
                  <th className="text-center font-medium px-4 py-3">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((s) => {
                  const total = s.num_customers * s.price_per_customer - s.discount;
                  const bal = total - s.amount_paid;
                  return (
                    <tr key={s.id} className="hover:bg-ink-50/50 transition-colors">
                      <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{formatDate(s.sale_date)}</td>
                      <td className="px-4 py-3 font-medium text-ink-800">{s.hairstyle_name || '—'}</td>
                      <td className="px-4 py-3 text-ink-600">{s.customer_name || '—'}</td>
                      <td className="px-4 py-3 text-center text-ink-600">{s.num_customers}</td>
                      <td className="px-4 py-3 text-right text-ink-600">{formatCurrency(s.price_per_customer)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-success-600">{formatCurrency(total)}</td>
                      <td className="px-4 py-3"><span className="badge bg-secondary-100 text-secondary-700">{s.payment_method}</span></td>
                      <td className={`px-4 py-3 text-right font-medium ${bal > 0 ? 'text-error-600' : 'text-ink-400'}`}>{bal > 0 ? formatCurrency(bal) : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(s)} className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                          <button onClick={() => del(s.id)} className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('edit') : t('newSale')} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('service')}</label>
              <select className="input" value={form.service_id} onChange={(e) => onServiceChange(e.target.value)}>
                <option value="">— {t('selectPeriod')} —</option>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('hairstyle')}</label>
              <select className="input" value={form.hairstyle_id} onChange={(e) => onHairstyleChange(e.target.value)}>
                <option value="">—</option>
                {hairstyles.filter((h) => !form.service_id || h.service_id === form.service_id).map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('hairstyle')} (text)</label>
              <input className="input" value={form.hairstyle_name} onChange={(e) => setForm({ ...form, hairstyle_name: e.target.value })} placeholder="Twende Kilioni" />
            </div>
            <div>
              <label className="label">{t('customerName')}</label>
              <input className="input" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">{t('numCustomers')}</label>
              <input type="number" min={1} className="input" value={form.num_customers} onChange={(e) => setForm({ ...form, num_customers: Math.max(1, parseInt(e.target.value) || 1) })} />
            </div>
            <div>
              <label className="label">{t('pricePerCustomer')}</label>
              <input type="number" min={0} className="input" value={form.price_per_customer} onChange={(e) => setForm({ ...form, price_per_customer: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">{t('discount')}</label>
              <input type="number" min={0} className="input" value={form.discount} onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">{t('paymentMethod')}</label>
              <select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('amountPaid')}</label>
              <input type="number" min={0} className="input" value={form.amount_paid} onChange={(e) => setForm({ ...form, amount_paid: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">{t('staff')}</label>
              <select className="input" value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
                <option value="">—</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('date')}</label>
              <input type="date" className="input" value={form.sale_date} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('notes')}</label>
              <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          {/* Summary box */}
          <div className="rounded-xl bg-primary-50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ink-600">{t('totalRevenue')}</span>
              <span className="font-semibold text-ink-900">{formatCurrency(totalRevenue)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-600">{t('amountPaid')}</span>
              <span className="font-semibold text-success-600">{formatCurrency(form.amount_paid)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-primary-100 pt-2">
              <span className="text-ink-600">{t('balance')}</span>
              <span className={`font-bold ${balance > 0 ? 'text-error-600' : 'text-success-600'}`}>{formatCurrency(balance)}</span>
            </div>
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
