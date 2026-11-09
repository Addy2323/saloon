import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Search,
  Trash2,
  ShoppingCart,
  X,
  ChevronDown,
  ChevronRight,
  Truck,
  Calendar,
  FileText,
  Edit3,
  Phone,
  MapPin,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, todayISO, startOfMonthISO } from '@/lib/format';
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
  const { t, lang } = useI18n();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState<'purchases' | 'suppliers'>('purchases');
  const [purchases, setPurchases] = useState<PurchaseWithItems[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<PurchaseItem[]>([]);

  const [form, setForm] = useState({
    supplier_id: '',
    purchase_date: todayISO(),
    notes: '',
  });
  const [items, setItems] = useState<{ product_id: string; quantity: number; unit_cost: number }[]>([]);

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    phone: '',
    location: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [purchRes, prodRes, suppRes] = await Promise.all([
      supabase
        .from('purchases')
        .select('*, suppliers(name)')
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ]);
    const list = (purchRes.data || []).map((p: any) => ({
      ...p,
      supplier_name: p.suppliers?.name,
    })) as PurchaseWithItems[];
    setPurchases(list);
    setProducts((prodRes.data || []) as Product[]);
    setSuppliers((suppRes.data || []) as Supplier[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdd = () => {
    setForm({ supplier_id: '', purchase_date: todayISO(), notes: '' });
    setItems([{ product_id: '', quantity: 1, unit_cost: 0 }]);
    setShowModal(true);
  };

  const openAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm({ name: '', phone: '', location: '', notes: '' });
    setShowSupplierModal(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSupplierForm({
      name: s.name,
      phone: s.phone || '',
      location: s.location || '',
      notes: s.notes || '',
    });
    setShowSupplierModal(true);
  };

  const saveSupplier = async () => {
    if (!supplierForm.name) {
      notify(t('error'), 'error');
      return;
    }
    const payload = {
      name: supplierForm.name,
      phone: supplierForm.phone || null,
      location: supplierForm.location || null,
      notes: supplierForm.notes || null,
    };
    if (editingSupplier) {
      const { error } = await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id);
      if (error) {
        notify(t('error'), 'error');
        return;
      }
    } else {
      const { error } = await supabase.from('suppliers').insert(payload);
      if (error) {
        notify(t('error'), 'error');
        return;
      }
    }
    notify(t('saved'));
    setShowSupplierModal(false);
    loadData();
  };

  const deleteSupplier = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) {
      notify(t('error'), 'error');
      return;
    }
    notify(t('deleted'));
    loadData();
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
    if (validItems.length === 0) {
      notify(t('error'), 'error');
      return;
    }

    const { data: purchase, error: purchErr } = await supabase
      .from('purchases')
      .insert({
        supplier_id: form.supplier_id || null,
        purchase_date: form.purchase_date,
        total_amount: grandTotal,
        notes: form.notes || null,
      })
      .select()
      .single();

    if (purchErr || !purchase) {
      notify(t('error'), 'error');
      return;
    }

    const insertData = validItems.map((i) => ({
      purchase_id: purchase.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
      line_total: i.quantity * i.unit_cost,
    }));

    const { error: itemsErr } = await supabase.from('purchase_items').insert(insertData);
    if (itemsErr) {
      notify(t('error'), 'error');
      return;
    }

    notify(t('saved'));
    setShowModal(false);
    loadData();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('purchases').delete().eq('id', id);
    if (error) {
      notify(t('error'), 'error');
      return;
    }
    notify(t('deleted'));
    loadData();
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    const { data } = await supabase.from('purchase_items').select('*, products(name)').eq('purchase_id', id);
    setDetailItems((data || []) as PurchaseItem[]);
  };

  const filtered = purchases.filter((p) => {
    if (!search) return true;
    return (
      p.supplier_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.notes?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const filteredSuppliers = suppliers.filter((s) => {
    if (!search) return true;
    return (
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.location?.toLowerCase().includes(search.toLowerCase()) ||
      s.phone?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalPurchases = purchases.reduce((s, p) => s + p.total_amount, 0);
  const monthStart = startOfMonthISO();
  const monthPurchases = purchases
    .filter((p) => p.purchase_date >= monthStart)
    .reduce((s, p) => s + p.total_amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-ink-900">{t('purchases')}</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            {lang === 'sw'
              ? 'Rekodi manunuzi ya bidhaa za saluni na taarifa za wasambazaji'
              : 'Record salon product purchases and manage supplier records'}
          </p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={openAddSupplier} className="btn btn-secondary">
            <Truck size={17} /> {lang === 'sw' ? 'Ongeza Msambazaji' : 'Add Supplier'}
          </button>
          <button onClick={openAdd} className="btn btn-primary">
            <Plus size={17} /> {t('newPurchase')}
          </button>
        </div>
      </div>

      {/* 4 KPI Cards — White with soft grey borders and subtle shadows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] flex items-center justify-center shrink-0">
            <ShoppingCart size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{t('thisMonth')}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{formatCurrency(monthPurchases)}</p>
            <p className="mt-1 text-xs text-[#6B7280]">{t('totalPurchases')}</p>
          </div>
        </div>

        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FDFAEF] border border-[#F4DE9E] text-[#B8862D] flex items-center justify-center shrink-0">
            <Calendar size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{t('allTime')}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{formatCurrency(totalPurchases)}</p>
            <p className="mt-1 text-xs text-[#B8862D] font-semibold">
              {purchases.length} {lang === 'sw' ? 'manunuzi' : 'purchase orders'}
            </p>
          </div>
        </div>

        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] flex items-center justify-center shrink-0">
            <Truck size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{t('manageSuppliers')}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{suppliers.length}</p>
            <p className="mt-1 text-xs text-[#D97706] font-semibold">
              {lang === 'sw' ? 'Wasambazaji waliosajiliwa' : 'Active suppliers'}
            </p>
          </div>
        </div>

        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#EDFCF2] border border-[#AAEFC6] text-[#098F50] flex items-center justify-center shrink-0">
            <FileText size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">
              {lang === 'sw' ? 'Wastani wa Manunuzi' : 'Average Order Value'}
            </p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">
              {formatCurrency(purchases.length > 0 ? Math.round(totalPurchases / purchases.length) : 0)}
            </p>
            <p className="mt-1 text-xs text-[#098F50] font-semibold">
              {lang === 'sw' ? 'Kwa kila oda' : 'Per purchase record'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-white border border-[#ece8f5] p-1">
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'purchases' ? 'bg-[#6d28d9] text-white shadow-sm' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <ShoppingCart size={15} /> {t('purchases')} ({purchases.length})
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'suppliers' ? 'bg-[#6d28d9] text-white shadow-sm' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Truck size={15} /> {t('manageSuppliers')} ({suppliers.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {activeTab === 'purchases' ? (
        <div className="panel overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<ShoppingCart size={32} />} title={t('noData')} />
          ) : (
            <div className="divide-y divide-[#f1edf8]">
              {filtered.map((p) => (
                <div key={p.id}>
                  <div
                    className="flex items-center justify-between px-5 py-4 hover:bg-[#faf8fe] transition-colors cursor-pointer"
                    onClick={() => toggleExpand(p.id)}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {expandedId === p.id ? (
                        <ChevronDown size={18} className="text-[#6d28d9]" />
                      ) : (
                        <ChevronRight size={18} className="text-ink-400" />
                      )}
                      <div className="w-10 h-10 rounded-xl bg-[#f3edff] text-[#6d28d9] flex items-center justify-center flex-shrink-0">
                        <ShoppingCart size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-900 truncate">
                          {p.supplier_name || t('supplier') + ' —'}
                        </p>
                        <p className="text-xs text-ink-500">
                          {formatDate(p.purchase_date)} {p.notes ? `· ${p.notes}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-extrabold text-ink-900">{formatCurrency(p.total_amount)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          del(p.id);
                        }}
                        className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {expandedId === p.id && detailItems.length > 0 && (
                    <div className="bg-[#faf8fe] px-6 pb-4 pt-2 border-t border-[#f1edf8]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-ink-500 text-xs">
                            <th className="text-left font-semibold py-2">{t('product')}</th>
                            <th className="text-right font-semibold py-2">{t('quantity')}</th>
                            <th className="text-right font-semibold py-2">{t('unitPrice')}</th>
                            <th className="text-right font-semibold py-2">{t('lineTotal')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailItems.map((item) => (
                            <tr key={item.id} className="border-t border-[#ece8f5]">
                              <td className="py-2.5 text-ink-800 font-medium">{(item as any).products?.name || '—'}</td>
                              <td className="py-2.5 text-right text-ink-600">{item.quantity}</td>
                              <td className="py-2.5 text-right text-ink-600">{formatCurrency(item.unit_cost)}</td>
                              <td className="py-2.5 text-right font-bold text-ink-900">
                                {formatCurrency(item.line_total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-[#ece8f5] font-bold">
                            <td colSpan={3} className="py-2.5 text-ink-800">
                              {t('total')}
                            </td>
                            <td className="py-2.5 text-right text-[#6d28d9]">{formatCurrency(p.total_amount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Supplier Records Directory */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((s) => {
            const supplierTotal = purchases
              .filter((p) => p.supplier_id === s.id)
              .reduce((sum, p) => sum + p.total_amount, 0);
            const supplierOrders = purchases.filter((p) => p.supplier_id === s.id).length;
            return (
              <div key={s.id} className="panel p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#f3edff] text-[#6d28d9] flex items-center justify-center shrink-0">
                        <Truck size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-ink-900">{s.name}</p>
                        {s.location && (
                          <p className="text-xs text-ink-500 flex items-center gap-1 mt-0.5">
                            <MapPin size={12} /> {s.location}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditSupplier(s)}
                        className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => deleteSupplier(s.id)}
                        className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {s.phone && (
                    <p className="mt-3 text-xs text-ink-600 flex items-center gap-1.5">
                      <Phone size={13} className="text-[#6d28d9]" /> {s.phone}
                    </p>
                  )}
                  {s.notes && <p className="mt-1.5 text-xs text-ink-400">{s.notes}</p>}
                </div>

                <div className="mt-4 pt-3 border-t border-[#f1edf8] flex items-center justify-between text-xs">
                  <span className="text-ink-500">
                    {supplierOrders} {lang === 'sw' ? 'manunuzi' : 'orders'}
                  </span>
                  <span className="font-bold text-[#6d28d9]">{formatCurrency(supplierTotal)}</span>
                </div>
              </div>
            );
          })}
          {filteredSuppliers.length === 0 && (
            <div className="col-span-full panel">
              <EmptyState icon={<Truck size={32} />} title={t('noData')} />
            </div>
          )}
        </div>
      )}

      {/* New Purchase Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={t('newPurchase')} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('supplier')}</label>
              <select
                className="input"
                value={form.supplier_id}
                onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('purchaseDate')}</label>
              <input
                type="date"
                className="input"
                value={form.purchase_date}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="label">{t('items')}</label>
              <button onClick={addItem} className="btn btn-ghost text-primary-600">
                <Plus size={16} /> {t('addItem')}
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select
                    className="input flex-1"
                    value={item.product_id}
                    onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                  >
                    <option value="">— {t('product')} —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    className="input w-24"
                    placeholder={t('quantity')}
                    value={item.quantity}
                    onChange={(e) => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                  />
                  <input
                    type="number"
                    min={0}
                    className="input w-32"
                    placeholder={t('unitPrice')}
                    value={item.unit_cost}
                    onChange={(e) => updateItem(i, 'unit_cost', parseFloat(e.target.value) || 0)}
                  />
                  <span className="flex items-center px-3 h-[42px] text-sm font-semibold text-ink-700 bg-ink-50 rounded-xl whitespace-nowrap">
                    {formatCurrency(item.quantity * item.unit_cost)}
                  </span>
                  <button onClick={() => removeItem(i)} className="btn btn-ghost text-error-500 p-2.5">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">{t('notes')}</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-primary-50 px-4 py-3">
            <span className="font-semibold text-ink-800">{t('grandTotal')}</span>
            <span className="text-xl font-extrabold text-primary-700">{formatCurrency(grandTotal)}</span>
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

      {/* Add/Edit Supplier Modal */}
      <Modal
        open={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title={editingSupplier ? t('edit') : t('supplier')}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="label">{t('name')}</label>
            <input
              className="input"
              value={supplierForm.name}
              onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
              placeholder="Kariakoo Beauty Wholesale"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('phone')}</label>
              <input
                className="input"
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                placeholder="0712 345 678"
              />
            </div>
            <div>
              <label className="label">{t('location')}</label>
              <input
                className="input"
                value={supplierForm.location}
                onChange={(e) => setSupplierForm({ ...supplierForm, location: e.target.value })}
                placeholder="Kariakoo, Dar es Salaam"
              />
            </div>
          </div>
          <div>
            <label className="label">{t('notes')}</label>
            <input
              className="input"
              value={supplierForm.notes}
              onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowSupplierModal(false)} className="btn btn-secondary">
              {t('cancel')}
            </button>
            <button onClick={saveSupplier} className="btn btn-primary">
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
