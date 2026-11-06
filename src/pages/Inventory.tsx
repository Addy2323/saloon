import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Package, Edit3, AlertTriangle, ArrowDownToLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, todayISO } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { EmptyState, StatusBadge } from '@/components/StatusBadge';
import type { Product, Category, ProductUsage } from '@/lib/types';

export function Inventory() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [usageRecords, setUsageRecords] = useState<(ProductUsage & { products: { name: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [form, setForm] = useState({
    name: '', category_id: '', unit: 'pcs', unit_cost: 0, low_stock_threshold: 5,
  });
  const [usageForm, setUsageForm] = useState({
    product_id: '', quantity: 1, usage_type: 'used' as 'used' | 'spoiled' | 'finished', usage_date: todayISO(), notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [prodRes, catRes, usageRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('categories').select('*').eq('type', 'product').order('name'),
      supabase.from('product_usage').select('*, products(name)').order('usage_date', { ascending: false }).limit(20),
    ]);
    setProducts((prodRes.data || []) as Product[]);
    setCategories((catRes.data || []) as Category[]);
    setUsageRecords((usageRes.data || []) as (ProductUsage & { products: { name: string } | null })[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', category_id: '', unit: 'pcs', unit_cost: 0, low_stock_threshold: 5 });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, category_id: p.category_id || '', unit: p.unit,
      unit_cost: p.unit_cost, low_stock_threshold: p.low_stock_threshold,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name) { notify(t('error'), 'error'); return; }
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      unit: form.unit,
      unit_cost: form.unit_cost,
      low_stock_threshold: form.low_stock_threshold,
    };
    if (editing) {
      const { error } = await supabase.from('products').update(payload).eq('id', editing.id);
      if (error) { notify(t('error'), 'error'); return; }
    } else {
      const { error } = await supabase.from('products').insert(payload);
      if (error) { notify(t('error'), 'error'); return; }
    }
    notify(t('saved'));
    setShowModal(false);
    loadData();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('deleted'));
    loadData();
  };

  const saveUsage = async () => {
    if (!usageForm.product_id || usageForm.quantity <= 0) { notify(t('error'), 'error'); return; }
    const { error } = await supabase.from('product_usage').insert({
      product_id: usageForm.product_id,
      quantity: usageForm.quantity,
      usage_type: usageForm.usage_type,
      usage_date: usageForm.usage_date,
      notes: usageForm.notes || null,
    });
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('saved'));
    setShowUsageModal(false);
    setUsageForm({ product_id: '', quantity: 1, usage_type: 'used', usage_date: todayISO(), notes: '' });
    loadData();
  };

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = products.filter((p) => p.current_stock <= p.low_stock_threshold && p.current_stock > 0).length;
  const outOfStockCount = products.filter((p) => p.current_stock <= 0).length;
  const totalStockValue = products.reduce((s, p) => s + p.current_stock * p.unit_cost, 0);

  const stockStatus = (p: Product): 'in-stock' | 'low' | 'out' => {
    if (p.current_stock <= 0) return 'out';
    if (p.current_stock <= p.low_stock_threshold) return 'low';
    return 'in-stock';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{t('inventory')}</h1>
          <p className="text-sm text-ink-500 mt-1">{t('productsInStock')}: {products.length} · {formatCurrency(totalStockValue)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowUsageModal(true)} className="btn btn-secondary">
            <ArrowDownToLine size={18} /> {t('recordUsage')}
          </button>
          <button onClick={openAdd} className="btn btn-primary">
            <Plus size={18} /> {t('add')}
          </button>
        </div>
      </div>

      {/* Alert summary */}
      {(lowStockCount > 0 || outOfStockCount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {lowStockCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-warning-50 px-4 py-2.5 text-warning-700">
              <AlertTriangle size={16} /> {lowStockCount} {t('lowStock')}
            </div>
          )}
          {outOfStockCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-error-50 px-4 py-2.5 text-error-700">
              <AlertTriangle size={16} /> {outOfStockCount} {t('outOfStock')}
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Package size={32} />} title={t('noData')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500">
                <tr>
                  <th className="text-left font-medium px-4 py-3">{t('productName')}</th>
                  <th className="text-left font-medium px-4 py-3">{t('category')}</th>
                  <th className="text-right font-medium px-4 py-3">{t('unitCost')}</th>
                  <th className="text-center font-medium px-4 py-3">{t('currentStock')}</th>
                  <th className="text-center font-medium px-4 py-3">{t('lowStockThreshold')}</th>
                  <th className="text-left font-medium px-4 py-3">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((p) => {
                  const status = stockStatus(p);
                  const cat = categories.find((c) => c.id === p.category_id);
                  return (
                    <tr key={p.id} className="hover:bg-ink-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink-800">{p.name}</td>
                      <td className="px-4 py-3 text-ink-600">{cat?.name || '—'}</td>
                      <td className="px-4 py-3 text-right text-ink-600">{formatCurrency(p.unit_cost)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-semibold text-ink-900">{p.current_stock} {p.unit}</span>
                          <StatusBadge
                            status={status}
                            label={status === 'out' ? t('outOfStock') : status === 'low' ? t('lowStock') : t('inStock')}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-ink-400">{p.low_stock_threshold}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                          <button onClick={() => del(p.id)} className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
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

      {/* Usage history */}
      {usageRecords.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900 mb-4">{t('recordUsage')} — {t('recent')}</h3>
          <div className="space-y-2">
            {usageRecords.map((u) => (
              <div key={u.id} className="flex items-center justify-between border-b border-ink-100 last:border-0 pb-2 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-error-50 text-error-600 flex items-center justify-center"><ArrowDownToLine size={14} /></span>
                  <div>
                    <p className="text-sm font-medium text-ink-800">{u.products?.name || '—'}</p>
                    <p className="text-xs text-ink-400">{t(u.usage_type)} · {formatDate(u.usage_date)}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-error-600">−{u.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit product modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('edit') : t('add')} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">{t('productName')}</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
              <label className="label">{t('unit')}</label>
              <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, bottle, kg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('unitCost')}</label>
              <input type="number" min={0} className="input" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">{t('lowStockThreshold')}</label>
              <input type="number" min={0} className="input" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn btn-secondary">{t('cancel')}</button>
            <button onClick={save} className="btn btn-primary">{t('save')}</button>
          </div>
        </div>
      </Modal>

      {/* Usage modal */}
      <Modal open={showUsageModal} onClose={() => setShowUsageModal(false)} title={t('recordUsage')} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">{t('product')}</label>
            <select className="input" value={usageForm.product_id} onChange={(e) => setUsageForm({ ...usageForm, product_id: e.target.value })}>
              <option value="">—</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('quantity')}</label>
              <input type="number" min={1} className="input" value={usageForm.quantity} onChange={(e) => setUsageForm({ ...usageForm, quantity: parseFloat(e.target.value) || 1 })} />
            </div>
            <div>
              <label className="label">{t('usageType')}</label>
              <select className="input" value={usageForm.usage_type} onChange={(e) => setUsageForm({ ...usageForm, usage_type: e.target.value as 'used' | 'spoiled' | 'finished' })}>
                <option value="used">{t('used')}</option>
                <option value="spoiled">{t('spoiled')}</option>
                <option value="finished">{t('finished')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('date')}</label>
              <input type="date" className="input" value={usageForm.usage_date} onChange={(e) => setUsageForm({ ...usageForm, usage_date: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('notes')}</label>
              <input className="input" value={usageForm.notes} onChange={(e) => setUsageForm({ ...usageForm, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowUsageModal(false)} className="btn btn-secondary">{t('cancel')}</button>
            <button onClick={saveUsage} className="btn btn-primary">{t('save')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
