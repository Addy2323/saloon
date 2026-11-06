import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Scissors, Users, Tag, Truck, Edit3, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';
import { EmptyState } from '@/components/StatusBadge';
import type { Service, Staff, Category, Supplier, Hairstyle } from '@/lib/types';

type Tab = 'services' | 'staff' | 'categories' | 'suppliers';

export function Settings() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('services');

  const tabs: { id: Tab; icon: typeof Scissors; key: string }[] = [
    { id: 'services', icon: Scissors, key: 'manageServices' },
    { id: 'staff', icon: Users, key: 'manageStaff' },
    { id: 'categories', icon: Tag, key: 'manageCategories' },
    { id: 'suppliers', icon: Truck, key: 'manageSuppliers' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{t('settings')}</h1>
        <p className="text-sm text-ink-500 mt-1">{t('manageServices')} · {t('manageStaff')} · {t('manageCategories')} · {t('manageSuppliers')}</p>
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 flex-wrap border-b border-ink-100">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          const isActive = tab === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}
            >
              <Icon size={16} /> {t(tb.key)}
            </button>
          );
        })}
      </div>

      {tab === 'services' && <ServicesTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'suppliers' && <SuppliersTab />}
    </div>
  );
}

function ServicesTab() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [hairstyles, setHairstyles] = useState<Hairstyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showHsForm, setShowHsForm] = useState(false);
  const [form, setForm] = useState({ name: '', default_price: 0 });
  const [hsForm, setHsForm] = useState({ service_id: '', name: '', default_price: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const [svcRes, hsRes] = await Promise.all([
      supabase.from('services').select('*').order('name'),
      supabase.from('hairstyles').select('*').order('name'),
    ]);
    setServices((svcRes.data || []) as Service[]);
    setHairstyles((hsRes.data || []) as Hairstyle[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name) { notify(t('error'), 'error'); return; }
    if (editing) {
      const { error } = await supabase.from('services').update(form).eq('id', editing.id);
      if (error) { notify(t('error'), 'error'); return; }
    } else {
      const { error } = await supabase.from('services').insert(form);
      if (error) { notify(t('error'), 'error'); return; }
    }
    notify(t('saved'));
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', default_price: 0 });
    load();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('deleted'));
    load();
  };

  const saveHs = async () => {
    if (!hsForm.name || !hsForm.service_id) { notify(t('error'), 'error'); return; }
    const { error } = await supabase.from('hairstyles').insert({
      service_id: hsForm.service_id,
      name: hsForm.name,
      default_price: hsForm.default_price,
    });
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('saved'));
    setShowHsForm(false);
    setHsForm({ service_id: '', name: '', default_price: 0 });
    load();
  };

  const delHs = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('hairstyles').delete().eq('id', id);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('deleted'));
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-ink-900">{t('manageServices')}</h3>
        <button onClick={() => { setEditing(null); setForm({ name: '', default_price: 0 }); setShowForm(true); }} className="btn btn-primary"><Plus size={16} /> {t('add')}</button>
      </div>

      {showForm && (
        <InlineForm onCancel={() => setShowForm(false)} onSave={save}>
          <input className="input" placeholder={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input type="number" min={0} className="input" placeholder={t('defaultPrice')} value={form.default_price} onChange={(e) => setForm({ ...form, default_price: parseFloat(e.target.value) || 0 })} />
        </InlineForm>
      )}

      <div className="space-y-3">
        {services.map((svc) => (
          <div key={svc.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center"><Scissors size={18} /></div>
                <div>
                  <p className="font-medium text-ink-800">{svc.name}</p>
                  <p className="text-sm text-ink-400">{formatCurrency(svc.default_price)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditing(svc); setForm({ name: svc.name, default_price: svc.default_price }); setShowForm(true); }} className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                <button onClick={() => del(svc.id)} className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
              </div>
            </div>
            {/* Hairstyles under this service */}
            <div className="mt-3 pl-13 space-y-1.5">
              {hairstyles.filter((h) => h.service_id === svc.id).map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
                  <span className="text-sm text-ink-700">{h.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-500">{formatCurrency(h.default_price)}</span>
                    <button onClick={() => delHs(h.id)} className="p-1 text-ink-400 hover:text-error-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => { setHsForm({ service_id: svc.id, name: '', default_price: svc.default_price }); setShowHsForm(true); }} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"><Plus size={12} /> {t('hairstyle')}</button>
            </div>
          </div>
        ))}
        {services.length === 0 && <EmptyState icon={<Scissors size={32} />} title={t('noData')} />}
      </div>

      {showHsForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={() => setShowHsForm(false)} />
          <div className="relative card p-5 w-full max-w-md animate-slide-up">
            <h3 className="font-semibold text-ink-900 mb-4">{t('hairstyle')}</h3>
            <div className="space-y-3">
              <input className="input" placeholder={t('name')} value={hsForm.name} onChange={(e) => setHsForm({ ...hsForm, name: e.target.value })} />
              <input type="number" min={0} className="input" placeholder={t('defaultPrice')} value={hsForm.default_price} onChange={(e) => setHsForm({ ...hsForm, default_price: parseFloat(e.target.value) || 0 })} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowHsForm(false)} className="btn btn-secondary">{t('cancel')}</button>
                <button onClick={saveHs} className="btn btn-primary">{t('save')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffTab() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', role: '', active: true });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('staff').select('*').order('name');
    setStaff((data || []) as Staff[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name) { notify(t('error'), 'error'); return; }
    const payload = { name: form.name, phone: form.phone || null, role: form.role || null, active: form.active };
    if (editing) {
      const { error } = await supabase.from('staff').update(payload).eq('id', editing.id);
      if (error) { notify(t('error'), 'error'); return; }
    } else {
      const { error } = await supabase.from('staff').insert(payload);
      if (error) { notify(t('error'), 'error'); return; }
    }
    notify(t('saved'));
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', phone: '', role: '', active: true });
    load();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('deleted'));
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-ink-900">{t('manageStaff')}</h3>
        <button onClick={() => { setEditing(null); setForm({ name: '', phone: '', role: '', active: true }); setShowForm(true); }} className="btn btn-primary"><Plus size={16} /> {t('add')}</button>
      </div>

      {showForm && (
        <InlineForm onCancel={() => setShowForm(false)} onSave={save}>
          <input className="input" placeholder={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder={t('phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder={t('role')} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </InlineForm>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {staff.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary-100 text-secondary-600 flex items-center justify-center"><Users size={18} /></div>
                <div>
                  <p className="font-medium text-ink-800">{s.name}</p>
                  <p className="text-xs text-ink-400">{s.role || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditing(s); setForm({ name: s.name, phone: s.phone || '', role: s.role || '', active: s.active ?? true }); setShowForm(true); }} className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                <button onClick={() => del(s.id)} className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-ink-500">{s.phone || '—'}</span>
              <span className={`badge ${s.active ? 'bg-success-100 text-success-700' : 'bg-ink-100 text-ink-500'}`}>
                {s.active ? t('active') : '—'}
              </span>
            </div>
          </div>
        ))}
        {staff.length === 0 && <div className="col-span-full"><EmptyState icon={<Users size={32} />} title={t('noData')} /></div>}
      </div>
    </div>
  );
}

function CategoriesTab() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'product' as 'product' | 'expense' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('categories').select('*').order('type').order('name');
    setCategories((data || []) as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name) { notify(t('error'), 'error'); return; }
    const { error } = await supabase.from('categories').insert(form);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('saved'));
    setShowForm(false);
    setForm({ name: '', type: 'product' });
    load();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('deleted'));
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>;

  const productCats = categories.filter((c) => c.type === 'product');
  const expenseCats = categories.filter((c) => c.type === 'expense');

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-ink-900">{t('manageCategories')}</h3>
        <button onClick={() => setShowForm(true)} className="btn btn-primary"><Plus size={16} /> {t('add')}</button>
      </div>

      {showForm && (
        <InlineForm onCancel={() => setShowForm(false)} onSave={save}>
          <input className="input" placeholder={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'product' | 'expense' })}>
            <option value="product">{t('inventory')}</option>
            <option value="expense">{t('expenses')}</option>
          </select>
        </InlineForm>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-ink-700 mb-3">{t('inventory')}</h4>
          <div className="flex flex-wrap gap-2">
            {productCats.map((c) => (
              <span key={c.id} className="badge bg-primary-100 text-primary-700 gap-1.5 pr-1.5">
                {c.name}
                <button onClick={() => del(c.id)} className="hover:text-error-600"><X size={12} /></button>
              </span>
            ))}
            {productCats.length === 0 && <p className="text-sm text-ink-400">{t('noData')}</p>}
          </div>
        </div>
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-ink-700 mb-3">{t('expenses')}</h4>
          <div className="flex flex-wrap gap-2">
            {expenseCats.map((c) => (
              <span key={c.id} className="badge bg-error-100 text-error-700 gap-1.5 pr-1.5">
                {c.name}
                <button onClick={() => del(c.id)} className="hover:text-error-600"><X size={12} /></button>
              </span>
            ))}
            {expenseCats.length === 0 && <p className="text-sm text-ink-400">{t('noData')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SuppliersTab() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', location: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers((data || []) as Supplier[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name) { notify(t('error'), 'error'); return; }
    const payload = { name: form.name, phone: form.phone || null, location: form.location || null, notes: form.notes || null };
    if (editing) {
      const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id);
      if (error) { notify(t('error'), 'error'); return; }
    } else {
      const { error } = await supabase.from('suppliers').insert(payload);
      if (error) { notify(t('error'), 'error'); return; }
    }
    notify(t('saved'));
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', phone: '', location: '', notes: '' });
    load();
  };

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) { notify(t('error'), 'error'); return; }
    notify(t('deleted'));
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-ink-900">{t('manageSuppliers')}</h3>
        <button onClick={() => { setEditing(null); setForm({ name: '', phone: '', location: '', notes: '' }); setShowForm(true); }} className="btn btn-primary"><Plus size={16} /> {t('add')}</button>
      </div>

      {showForm && (
        <InlineForm onCancel={() => setShowForm(false)} onSave={save}>
          <input className="input" placeholder={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder={t('phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder={t('location')} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </InlineForm>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {suppliers.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-100 text-accent-600 flex items-center justify-center"><Truck size={18} /></div>
                <div>
                  <p className="font-medium text-ink-800">{s.name}</p>
                  <p className="text-xs text-ink-400">{s.location || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditing(s); setForm({ name: s.name, phone: s.phone || '', location: s.location || '', notes: s.notes || '' }); setShowForm(true); }} className="p-1.5 text-ink-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Edit3 size={16} /></button>
                <button onClick={() => del(s.id)} className="p-1.5 text-ink-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
              </div>
            </div>
            <p className="mt-3 text-sm text-ink-500">{s.phone || '—'}</p>
          </div>
        ))}
        {suppliers.length === 0 && <div className="col-span-full"><EmptyState icon={<Truck size={32} />} title={t('noData')} /></div>}
      </div>
    </div>
  );
}

function InlineForm({ children, onCancel, onSave }: { children: React.ReactNode; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="card p-4 animate-scale-in">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {children}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn btn-secondary"><X size={16} /> {useI18n().t('cancel')}</button>
        <button onClick={onSave} className="btn btn-primary"><Check size={16} /> {useI18n().t('save')}</button>
      </div>
    </div>
  );
}
