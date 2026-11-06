import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, ShoppingCart, Eye, X, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, todayISO } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/StatusBadge';
import type { Purchase, PurchaseItem, Product, Supplier } from '@/lib/types';

interface PurchaseWithItems extends Purchase {
  supplier_name?: string;
  items_count?: number;
}

export function Purchases() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [purchases, setPurchases] = useState<PurchaseWithItems[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<PurchaseItem[]>([]);

  const [form, setForm] = useState({
    supplier_id: '',
    purchase_date: todayISO(),
    notes: '',
  });
  const [items, setItems] = useState<{ product_id: string; quantity: number; unit_cost: number }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [purchRes, prodRes, suppRes] = await Promise.all([
      supabase.from('purchases').select('*, suppliers(name)').order('purchase_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ]);
    setPurchases((purchRes.data || []).map((p: any) => ({
      ...p,
      supplier_name: p.suppliers?.name,
    })) as PurchaseWithItems[]);
    setProducts((prodRes.data || []) as Product[]);
    setSuppliers((suppRes.data || []) as Supplier[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setForm({ supplier_id: '', purchase_date: todayISO(), notes: '' });
    setItems([{ product_id: '', quantity: 1, unit_cost: 0 }]);
    setShowModal(true);
  };

  const addItem = () => setItems([...items, { product_id: '', quantity: 1, unit_cost: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: 'product_id' | 'quantity' | 'unit_cost', value: string | number) => {
    const updated = [...items];
    if (field === 'product_id') {
      updated[i].product_id = value as string;
      const prod = products.find((p) => p.id === value);
      if (prod) updated[i].unit_cost = prod.unit_cost;
    } else {
      updated[i][field] = value as number;
    }
    setItems(updated);
  };

  const grandTotal = items.reduce((s, item) => s + item.quantity * item.unit_cost, 0);

  const save = async () => {
    const validItems = items.filter((i) => i.product_id && i.quantity > 0);
    if (validItems.length === 0) { notify(t('error'), 'error'); return; }

    const { data: purchase, error: purchErr } = await supabase.from('purchases').insert({
      supplier_id: form.supplier_id || null,
      purchase_date: form.purchase_date,
      total_amount: grandTotal,
      notes: form.notes || null,
    }).select().single();

    if (purchErr || !purchase) { notify(t('error'), 'error'); return; }

    const insertData = validItems.map((i) => ({
      purchase_id: purchase.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
      line_total: i.quantity * i.unit_cost,
    }));

    const { error: itemsErr } = await supabase.from('purchase_items').insert(insertData);
    if (itemsErr) { notify(t('error'), 'error'); return; }

    notify(t('saved'));
    setShowModal(false);
    loadData();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('purchases').delete().eq('id', id);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('deleted'));
    loadData();
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    const { data } = await supabase.from('purchase_items').select('*, products(name)').eq('purchase_id', id);
    setDetailItems((data || []) as PurchaseItem[]);
  };

  const filtered = purchases.filter((p) => {
    if (!search) return true;
    return p.supplier_name?.toLowerCase().includes(search.toLowerCase()) || p.notes?.toLowerCase().includes(search.toLowerCase());
  });

  const totalPurchases = purchases.reduce((s, p) => s + p.total_amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{t('purchases')}</h1>
          <p className="text-sm text-ink-500 mt-1">{t('allTime')}: <span className="font-semibold text-ink-700">{formatCurrency(totalPurchases)}</span></p>
        </div>
        <button onClick={openAdd} className="btn btn-primary">
          <Plus size={18} /> {t('newPurchase')}
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ShoppingCart size={32} />} title={t('noData')} />
        ) : (
          <div className="divide-y divide-ink-100">
            {filtered.map((p) => (
              <div key={p.id}>
                <div
                  className="flex items-center justify-between px-4 py-4 hover:bg-ink-50/50 transition-colors cursor-pointer"
                  onClick={() => toggleExpand(p.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {expandedId === p.id ? <ChevronDown size={18} className="text-ink-400" /> : <ChevronRight size={18} className="text-ink-400" />}
                    <div className="w-10 h-10 rounded-xl bg-secondary-100 text-secondary-600 flex items-center justify-center flex-shrink-0">
                      <ShoppingCart size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-800 truncate">{p.supplier_name || t('supplier') + ' —'}</p>
                      <p className="text-xs text-ink-400">{formatDate(p.purchase_date)} · {p.notes || ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-ink-900">{formatCurrency(p.total_amount)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); del(p.id); }}
                      className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {expandedId === p.id && detailItems.length > 0 && (
                  <div className="bg-ink-50/50 px-4 pb-4 pt-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-ink-400 text-xs">
                          <th className="text-left font-medium py-2">{t('product')}</th>
                          <th className="text-right font-medium py-2">{t('quantity')}</th>
                          <th className="text-right font-medium py-2">{t('unitPrice')}</th>
                          <th className="text-right font-medium py-2">{t('lineTotal')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailItems.map((item) => (
                          <tr key={item.id} className="border-t border-ink-100">
                            <td className="py-2 text-ink-700 font-medium">{(item as any).products?.name || '—'}</td>
                            <td className="py-2 text-right text-ink-600">{item.quantity}</td>
                            <td className="py-2 text-right text-ink-600">{formatCurrency(item.unit_cost)}</td>
                            <td className="py-2 text-right font-semibold text-ink-800">{formatCurrency(item.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={t('newPurchase')} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('supplier')}</label>
              <select className="input" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('purchaseDate')}</label>
              <input type="date" className="input" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="label">{t('items')}</label>
              <button onClick={addItem} className="btn btn-ghost text-primary-600"><Plus size={16} /> {t('addItem')}</button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select className="input flex-1" value={item.product_id} onChange={(e) => updateItem(i, 'product_id', e.target.value)}>
                    <option value="">— {t('product')} —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min={1} className="input w-24" placeholder={t('quantity')} value={item.quantity} onChange={(e) => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)} />
                  <input type="number" min={0} className="input w-32" placeholder={t('unitPrice')} value={item.unit_cost} onChange={(e) => updateItem(i, 'unit_cost', parseFloat(e.target.value) || 0)} />
                  <span className="flex items-center px-3 h-[42px] text-sm font-semibold text-ink-700 bg-ink-50 rounded-xl whitespace-nowrap">
                    {formatCurrency(item.quantity * item.unit_cost)}
                  </span>
                  <button onClick={() => removeItem(i)} className="btn btn-ghost text-error-500 p-2.5"><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">{t('notes')}</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-primary-50 px-4 py-3">
            <span className="font-medium text-ink-700">{t('grandTotal')}</span>
            <span className="text-xl font-bold text-primary-700">{formatCurrency(grandTotal)}</span>
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
