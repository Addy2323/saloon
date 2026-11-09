import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Package,
  Edit3,
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  Coins,
  PackageX,
  Upload,
  Camera,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, todayISO } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { EmptyState, StatusBadge } from '@/components/StatusBadge';
import type { Product, Category, ProductUsage } from '@/lib/types';

export function Inventory() {
  const { t, lang } = useI18n();
  const { notify } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [usageRecords, setUsageRecords] = useState<(ProductUsage & { products: { name: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [form, setForm] = useState({
    name: '',
    category_id: '',
    unit: 'pcs',
    unit_cost: 0,
    current_stock: 0,
    low_stock_threshold: 5,
    image_url: '',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImageFile = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify(lang === 'sw' ? 'Tafadhali chagua faili la picha halisi' : 'Please select a valid image file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          setForm((prev) => ({ ...prev, image_url: compressed }));
        } else {
          setForm((prev) => ({ ...prev, image_url: src }));
        }
        notify(lang === 'sw' ? 'Picha imepakiwa kikamilifu!' : 'Product image attached successfully!');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const [usageForm, setUsageForm] = useState({
    product_id: '',
    quantity: 1,
    usage_type: 'used' as 'used' | 'spoiled' | 'finished',
    usage_date: todayISO(),
    notes: '',
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      name: '',
      category_id: '',
      unit: 'pcs',
      unit_cost: 0,
      current_stock: 0,
      low_stock_threshold: 5,
      image_url: '',
    });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      category_id: p.category_id || '',
      unit: p.unit,
      unit_cost: p.unit_cost,
      current_stock: p.current_stock,
      low_stock_threshold: p.low_stock_threshold,
      image_url: p.image_url || '',
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name) {
      notify(t('error'), 'error');
      return;
    }
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      unit: form.unit,
      unit_cost: form.unit_cost,
      current_stock: form.current_stock,
      low_stock_threshold: form.low_stock_threshold,
      image_url: form.image_url || null,
    };
    if (editing) {
      const { error } = await supabase.from('products').update(payload).eq('id', editing.id);
      if (error) {
        notify(t('error'), 'error');
        return;
      }
    } else {
      const { error } = await supabase.from('products').insert(payload);
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
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      notify(t('error'), 'error');
      return;
    }
    notify(t('deleted'));
    loadData();
  };

  const saveUsage = async () => {
    if (!usageForm.product_id || usageForm.quantity <= 0) {
      notify(t('error'), 'error');
      return;
    }
    const { error } = await supabase.from('product_usage').insert({
      product_id: usageForm.product_id,
      quantity: usageForm.quantity,
      usage_type: usageForm.usage_type,
      usage_date: usageForm.usage_date,
      notes: usageForm.notes || null,
    });
    if (error) {
      notify(t('error'), 'error');
      return;
    }
    notify(t('saved'));
    setShowUsageModal(false);
    setUsageForm({ product_id: '', quantity: 1, usage_type: 'used', usage_date: todayISO(), notes: '' });
    loadData();
  };

  const filtered = products.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'all' || p.category_id === selectedCategory;
    return matchesSearch && matchesCat;
  });

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
      {/* Top Action Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-ink-900">{t('inventory')}</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            {lang === 'sw'
              ? 'Simamia bidhaa za saluni, akiba iliyopo, na matumizi ya kila siku'
              : 'Manage salon products, available stock quantities, and daily consumption'}
          </p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={() => setShowUsageModal(true)} className="btn btn-secondary">
            <ArrowDownToLine size={17} /> {t('recordUsage')}
          </button>
          <button onClick={openAdd} className="btn btn-primary">
            <Plus size={17} /> {t('add')}
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards — White with soft grey borders and subtle shadows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] flex items-center justify-center shrink-0">
            <Boxes size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{t('productsInStock')}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{products.length}</p>
            <p className="mt-1 text-xs text-[#6B7280]">{categories.length} {t('category').toLowerCase()}</p>
          </div>
        </div>

        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FDFAEF] border border-[#F4DE9E] text-[#B8862D] flex items-center justify-center shrink-0">
            <Coins size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">
              {lang === 'sw' ? 'Thamani ya Stoo' : 'Total Stock Value'}
            </p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{formatCurrency(totalStockValue)}</p>
            <p className="mt-1 text-xs text-[#098F50] font-semibold">
              {products.filter((p) => p.current_stock > p.low_stock_threshold).length} {t('inStock').toLowerCase()}
            </p>
          </div>
        </div>

        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] flex items-center justify-center shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{t('lowStock')}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{lowStockCount}</p>
            <p className="mt-1 text-xs text-[#D97706] font-semibold">
              {lang === 'sw' ? 'Zinakaribia kuisha' : 'Need restocking soon'}
            </p>
          </div>
        </div>

        <div className="panel p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] flex items-center justify-center shrink-0">
            <PackageX size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#4B5563]">{t('outOfStock')}</p>
            <p className="mt-0.5 text-2xl font-extrabold text-[#111827]">{outOfStockCount}</p>
            <p className="mt-1 text-xs text-[#DC2626] font-semibold">
              {lang === 'sw' ? 'Zimeisha kabisa' : 'Depleted items'}
            </p>
          </div>
        </div>
      </div>

      {/* Category Filter + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              selectedCategory === 'all'
                ? 'bg-[#6d28d9] text-white shadow-sm'
                : 'bg-white text-ink-600 border border-[#ece8f5] hover:border-primary-300'
            }`}
          >
            {lang === 'sw' ? 'Zote' : 'All Products'} ({products.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                selectedCategory === c.id
                  ? 'bg-[#6d28d9] text-white shadow-sm'
                  : 'bg-white text-ink-600 border border-[#ece8f5] hover:border-primary-300'
              }`}
            >
              {c.name}
            </button>
          ))}
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

      {/* Products Table */}
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Package size={32} />} title={t('noData')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f6fc] text-ink-500 border-b border-[#ece8f5]">
                <tr>
                  <th className="text-left font-semibold px-4 py-3.5">{t('productName')}</th>
                  <th className="text-left font-semibold px-4 py-3.5">{t('category')}</th>
                  <th className="text-right font-semibold px-4 py-3.5">{t('unitCost')}</th>
                  <th className="text-center font-semibold px-4 py-3.5">{t('currentStock')}</th>
                  <th className="text-center font-semibold px-4 py-3.5">{t('lowStockThreshold')}</th>
                  <th className="text-right font-semibold px-4 py-3.5">{t('total')}</th>
                  <th className="text-center font-semibold px-4 py-3.5">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1edf8]">
                {filtered.map((p) => {
                  const status = stockStatus(p);
                  const cat = categories.find((c) => c.id === p.category_id);
                  return (
                    <tr key={p.id} className="hover:bg-[#faf8fe] transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="w-11 h-11 rounded-xl object-cover ring-1 ring-[#E5E7EB] shadow-2xs shrink-0 bg-white"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] flex items-center justify-center shrink-0">
                              <Package size={20} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-[#111827] truncate">{p.name}</p>
                            <p className="text-[11px] text-[#6B7280]">
                              {p.unit} · {formatCurrency(p.unit_cost)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {cat ? (
                          <span className="badge bg-[#f3edff] text-[#6d28d9]">{cat.name}</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-ink-700 font-medium">{formatCurrency(p.unit_cost)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-bold text-ink-900">
                            {p.current_stock} {p.unit}
                          </span>
                          <StatusBadge
                            status={status}
                            label={
                              status === 'out' ? t('outOfStock') : status === 'low' ? t('lowStock') : t('inStock')
                            }
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-ink-400">{p.low_stock_threshold}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-ink-900">
                        {formatCurrency(p.current_stock * p.unit_cost)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => del(p.id)}
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
            </table>
          </div>
        )}
      </div>

      {/* Product Usage & Consumption Log */}
      {usageRecords.length > 0 && (
        <div className="panel p-5">
          <h3 className="font-bold text-ink-900 mb-4">
            {t('recordUsage')} — {t('recent')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {usageRecords.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-xl border border-[#f1edf8] bg-[#faf8fe] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-error-50 text-error-600 flex items-center justify-center">
                    <ArrowDownToLine size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{u.products?.name || '—'}</p>
                    <p className="text-xs text-ink-500">
                      {t(u.usage_type)} · {formatDate(u.usage_date)} {u.notes ? `· ${u.notes}` : ''}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-error-600">−{u.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Product Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t('edit') : t('add')} size="md">
        <div className="space-y-4">
          {/* Product Image Upload Section */}
          <div>
            <label className="label flex items-center justify-between">
              <span>{lang === 'sw' ? 'Picha ya Bidhaa' : 'Product Image'}</span>
              <span className="text-[11px] text-[#6B7280]">
                {lang === 'sw' ? 'Hiari (PNG, JPG, WEBP)' : 'Optional (PNG, JPG, WEBP)'}
              </span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageFile(f);
                e.target.value = '';
              }}
            />

            {form.image_url ? (
              <div className="relative rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 flex items-center gap-4">
                <img
                  src={form.image_url}
                  alt={form.name || 'Product'}
                  className="w-20 h-20 rounded-xl object-cover ring-2 ring-[#6D28D9]/25 shadow-2xs shrink-0 bg-white"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#111827]">
                    {lang === 'sw' ? 'Picha ya Bidhaa Imepakiwa' : 'Product Photo Attached'}
                  </p>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    {lang === 'sw'
                      ? 'Itaonekana kwenye orodha ya bidhaa na dirisha la mauzo.'
                      : 'Will appear in your inventory list and POS sales checkout.'}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-[#D1D5DB] text-[#374151] hover:bg-gray-50 transition"
                    >
                      {lang === 'sw' ? 'Badili Picha' : 'Change Photo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, image_url: '' })}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg text-[#DC2626] hover:bg-[#FEF2F2] transition"
                    >
                      {lang === 'sw' ? 'Ondoa' : 'Remove'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleImageFile(f);
                }}
                className="group relative cursor-pointer rounded-2xl border-2 border-dashed border-[#DDD6FE] hover:border-[#6D28D9] bg-[#FAF8FE] hover:bg-[#F5F3FF] p-4 text-center transition-all duration-200"
              >
                <div className="mx-auto w-12 h-12 rounded-xl bg-white text-[#6D28D9] shadow-2xs border border-[#DDD6FE] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Upload size={20} />
                </div>
                <p className="mt-2 text-xs font-bold text-[#111827]">
                  {lang === 'sw' ? 'Bofya hapa au buruta picha ya bidhaa' : 'Click to upload or drag & drop product photo'}
                </p>
                <p className="mt-0.5 text-[11px] text-[#6B7280]">
                  {lang === 'sw'
                    ? 'Inasaidia picha za simu au faili za kompyuta (PNG, JPG, WEBP)'
                    : 'Supports camera capture and desktop files (PNG, JPG, WEBP)'}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="label">{t('productName')}</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Rasta, Hair Oil, Shampoo..."
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
              <label className="label">{t('unit')}</label>
              <input
                className="input"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="pcs, bottle, pack"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">{t('unitCost')}</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.unit_cost}
                onChange={(e) => setForm({ ...form, unit_cost: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">{t('currentStock')}</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.current_stock}
                onChange={(e) => setForm({ ...form, current_stock: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="label">{t('lowStockThreshold')}</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: parseFloat(e.target.value) || 0 })}
              />
            </div>
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

      {/* Record Product Usage Modal */}
      <Modal open={showUsageModal} onClose={() => setShowUsageModal(false)} title={t('recordUsage')} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">{t('product')}</label>
            <select
              className="input"
              value={usageForm.product_id}
              onChange={(e) => setUsageForm({ ...usageForm, product_id: e.target.value })}
            >
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.current_stock} {p.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('quantity')}</label>
              <input
                type="number"
                min={1}
                className="input"
                value={usageForm.quantity}
                onChange={(e) => setUsageForm({ ...usageForm, quantity: parseFloat(e.target.value) || 1 })}
              />
            </div>
            <div>
              <label className="label">{t('usageType')}</label>
              <select
                className="input"
                value={usageForm.usage_type}
                onChange={(e) =>
                  setUsageForm({ ...usageForm, usage_type: e.target.value as 'used' | 'spoiled' | 'finished' })
                }
              >
                <option value="used">{t('used')}</option>
                <option value="spoiled">{t('spoiled')}</option>
                <option value="finished">{t('finished')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('date')}</label>
              <input
                type="date"
                className="input"
                value={usageForm.usage_date}
                onChange={(e) => setUsageForm({ ...usageForm, usage_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{t('notes')}</label>
              <input
                className="input"
                value={usageForm.notes}
                onChange={(e) => setUsageForm({ ...usageForm, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowUsageModal(false)} className="btn btn-secondary">
              {t('cancel')}
            </button>
            <button onClick={saveUsage} className="btn btn-primary">
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
