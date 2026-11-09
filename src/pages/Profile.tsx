import React, { useState, useRef } from 'react';
import {
  User,
  Mail,
  Phone,
  KeyRound,
  ShieldCheck,
  Check,
  LogOut,
  Camera,
  Trash2,
  Upload,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, SYSTEM_MODULES, validatePasswordStrength } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function resizeImageToDataUrl(file: File, maxSize = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function Profile({ embedded = false }: { embedded?: boolean }) {
  const { user, updateProfile, changePassword, changePin, logout, canPerform } = useAuth();
  const { lang, t } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    department: user?.department || '',
  });

  // Profile picture preview state
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState('');

  // Password management state
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // PIN update state (never displays existing PIN in plaintext)
  const [pinForm, setPinForm] = useState({
    currentPassword: '',
    newPin: '',
  });
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  if (!user) return null;

  const defaultMonogramAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    user.name,
  )}&background=6D28D9&color=FAE29C&bold=true&size=256`;

  const displayedAvatar = previewAvatar || user.avatar || defaultMonogramAvatar;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      setAvatarError(
        lang === 'sw'
          ? 'Tafadhali chagua picha ya JPG, JPEG, PNG au WebP pekee.'
          : 'Unsupported file format. Please upload a JPG, JPEG, PNG, or WebP image.',
      );
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setAvatarError(
        lang === 'sw'
          ? 'Ukubwa wa picha umezidi 5MB. Chagua picha ndogo.'
          : 'Image size exceeds the 5MB limit. Please choose a smaller image.',
      );
      return;
    }

    try {
      const dataUrl = await resizeImageToDataUrl(file, 320);
      setPreviewAvatar(dataUrl);
    } catch (err: any) {
      setAvatarError(err?.message || 'Could not process image.');
    }
  };

  const handleSaveAvatarPreview = () => {
    if (!previewAvatar) return;
    const res = updateProfile({ avatar: previewAvatar });
    if (!res.ok) {
      setAvatarError(res.error || 'Failed to update profile picture.');
      return;
    }
    setPreviewAvatar(null);
    notify(lang === 'sw' ? 'Picha ya wasifu imehifadhiwa!' : 'Profile picture updated across the portal!');
  };

  const handleRemoveAvatar = () => {
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      form.name || user.name,
    )}&background=6D28D9&color=FAE29C&bold=true&size=256`;
    setPreviewAvatar(null);
    const res = updateProfile({ avatar: fallback });
    if (res.ok) {
      notify(lang === 'sw' ? 'Picha ya wasifu imeondolewa.' : 'Profile picture removed.');
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const patch: any = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      department: form.department,
    };
    if (previewAvatar) {
      patch.avatar = previewAvatar;
    }
    const res = updateProfile(patch);
    if (!res.ok) {
      notify(res.error || t('error'), 'error');
      return;
    }
    setPreviewAvatar(null);
    notify(t('saved'));
  };

  const handlePinChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    if (!pinForm.currentPassword || pinForm.newPin.length !== 4) {
      setPinError(
        lang === 'sw'
          ? 'Weka nywila yako ya sasa na PIN mpya ya tarakimu 4.'
          : 'Enter your current password and a new 4-digit PIN.',
      );
      return;
    }
    setPinLoading(true);
    const res = await changePin(pinForm.currentPassword, pinForm.newPin);
    setPinLoading(false);
    if (!res.ok) {
      setPinError(res.error || 'Could not update PIN.');
      return;
    }
    setPinForm({ currentPassword: '', newPin: '' });
    notify(lang === 'sw' ? 'PIN imebadilishwa kwa usalama!' : '4-Digit PIN updated securely!');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');

    if (!pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword) {
      setPwError(lang === 'sw' ? 'Tafadhali jaza sehemu zote za nywila.' : 'Please fill in all password fields.');
      return;
    }

    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError(
        lang === 'sw'
          ? 'Nywila mpya na uthibitisho wake hazilingani.'
          : 'New password and confirmation do not match.',
      );
      return;
    }

    setPwLoading(true);
    const res = await changePassword(pwForm.currentPassword, pwForm.newPassword);
    setPwLoading(false);

    if (!res.ok) {
      setPwError(res.error || 'Could not update password.');
      return;
    }

    setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    notify(lang === 'sw' ? 'Nywila imebadilishwa kikamilifu!' : 'Password updated securely!');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const pwStrength = validatePasswordStrength(pwForm.newPassword);

  return (
    <div className="space-y-6 max-w-5xl">
      {!embedded && (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-[#111827]">
              {lang === 'sw' ? 'Wasifu wa Mtumiaji' : 'My Salon Profile'}
            </h2>
            <p className="text-xs text-[#4B5563] mt-0.5">
              {lang === 'sw'
                ? 'Dhibiti picha ya wasifu, taarifa binafsi, nywila na ruhusa za mfumo'
                : 'Manage your profile picture, personal information, password security, and active permissions'}
            </p>
          </div>
          <button onClick={handleLogout} className="btn btn-danger">
            <LogOut size={16} />
            <span>{lang === 'sw' ? 'Ondoka (Logout)' : 'Sign Out'}</span>
          </button>
        </div>
      )}

      {user.mustChangePassword && (
        <div className="rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] shrink-0 mt-0.5" />
          <div className="text-xs text-[#92400E]">
            <p className="font-extrabold">
              {lang === 'sw' ? 'Badilisha Nywila ya Muda' : 'Temporary Password Active — Please Update Your Password'}
            </p>
            <p className="mt-0.5">
              {lang === 'sw'
                ? 'Umeingia kwa kutumia nywila ya muda. Tafadhali weka nywila yako mpya hapa chini.'
                : 'You signed in using a temporary password. Please set a new personal password below to secure your account.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* =================================================================
            LEFT COLUMN: PROFILE PICTURE & GRANULAR PERMISSIONS
        ================================================================= */}
        <div className="panel p-6 flex flex-col items-center text-center">
          <div className="relative group">
            <img
              src={displayedAvatar}
              alt={user.name}
              className="w-28 h-28 rounded-full object-cover ring-4 ring-[#EDE9FE] shadow-md"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload new profile picture"
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#6D28D9] text-white flex items-center justify-center shadow-lg hover:bg-[#5B21B6] transition cursor-pointer"
            >
              <Camera size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Picture Upload & Remove Controls */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5F3FF] text-[#6D28D9] hover:bg-[#EDE9FE] text-xs font-bold transition"
            >
              <Upload size={13} />
              {lang === 'sw' ? 'Badili Picha' : 'Change Photo'}
            </button>
            <button
              type="button"
              onClick={handleRemoveAvatar}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] text-xs font-semibold transition"
            >
              <Trash2 size={13} />
              {lang === 'sw' ? 'Ondoa' : 'Remove'}
            </button>
          </div>
          <p className="text-[10px] text-[#6B7280] mt-1">JPG, JPEG, PNG, WebP (Max 5MB)</p>

          {/* Live Preview Confirmation Bar */}
          {previewAvatar && (
            <div className="w-full mt-3 p-3 rounded-xl bg-[#F0FDF4] border border-[#86EFAC] space-y-2">
              <p className="text-[11px] font-bold text-[#15803D]">
                {lang === 'sw' ? 'Hakiki Picha Mpya Kabla ya Kuhifadhi' : 'Previewing New Profile Picture'}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAvatarPreview}
                  className="px-3 py-1.5 rounded-lg bg-[#16A34A] text-white text-xs font-bold hover:bg-[#15803D]"
                >
                  {lang === 'sw' ? 'Hifadhi Picha' : 'Save Photo'}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAvatar(null)}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#475569] text-xs font-semibold"
                >
                  {lang === 'sw' ? 'Ghairi' : 'Discard'}
                </button>
              </div>
            </div>
          )}

          {avatarError && <p className="mt-2 text-xs font-semibold text-[#DC2626]">{avatarError}</p>}

          <h3 className="text-lg font-extrabold text-[#111827] mt-4">{user.name}</h3>
          <span className="mt-1 badge bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] px-3 py-1">
            {user.roleTitle}
          </span>
          <p className="mt-2.5 text-xs text-[#4B5563]">{user.email}</p>
          <p className="text-xs text-[#6B7280] mt-0.5">{user.phone}</p>

          {/* Active Granular Permissions Summary */}
          <div className="w-full mt-6 pt-4 border-t border-[#E5E7EB] text-left space-y-2">
            <p className="text-xs font-bold text-[#111827] flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-[#6D28D9]" />
              <span>{lang === 'sw' ? 'Ruhusa za Cheo Chako' : 'Your Active Role Permissions'}</span>
            </p>
            <ul className="space-y-2 pt-1">
              {SYSTEM_MODULES.map((m) => {
                const canView = canPerform(m.key, 'view');
                const actions = m.supportedActions.filter((act) => canPerform(m.key, act));
                return (
                  <li key={m.key} className="text-xs border-b border-[#F3F4F6] pb-1.5 last:border-b-0">
                    <div className="flex items-center justify-between">
                      <span className={canView ? 'text-[#1F2937] font-semibold' : 'text-[#9CA3AF] line-through'}>
                        {lang === 'sw' ? m.labelSw : m.label}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${canView ? 'bg-[#098F50]' : 'bg-[#D1D5DB]'}`} />
                    </div>
                    {canView && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {actions.map((act) => (
                          <span
                            key={act}
                            className="px-1.5 py-0.5 rounded bg-[#F5F3FF] text-[#6D28D9] text-[10px] font-bold uppercase"
                          >
                            {act}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* =================================================================
            RIGHT COLUMN: PERSONAL DETAILS + PASSWORD SECURITY
        ================================================================= */}
        <div className="lg:col-span-2 space-y-6">
          {/* Edit Personal Information Form */}
          <form onSubmit={handleSaveProfile} className="panel p-6 space-y-4">
            <h3 className="font-bold text-[#111827] text-base border-b border-[#E5E7EB] pb-3">
              {lang === 'sw' ? 'Hariri Taarifa za Akaunti' : 'Personal Account Information'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{lang === 'sw' ? 'Jina Kamili' : 'Full Name'}</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    required
                    className="input pl-10"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label">{lang === 'sw' ? 'Cheo (Role)' : 'Assigned Role'}</label>
                <input className="input bg-[#F9FAFB] text-[#6B7280]" value={user.roleTitle} disabled />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{lang === 'sw' ? 'Barua Pepe' : 'Email Address'}</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    required
                    type="email"
                    className="input pl-10"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label">{lang === 'sw' ? 'Namba ya Simu' : 'Phone Number'}</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    required
                    className="input pl-10"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="max-w-xs">
              <label className="label">{lang === 'sw' ? 'Idara / Majukumu' : 'Department / Responsibilities'}</label>
              <input
                className="input"
                placeholder="e.g., Executive Management, Front Desk..."
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button type="submit" className="btn btn-primary">
                <Check size={16} />
                <span>{t('save')}</span>
              </button>
            </div>
          </form>

          {/* Secure 4-Digit PIN Update Form (Salted Hash, Never Displayed in Plaintext) */}
          <form onSubmit={handlePinChange} className="panel p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <KeyRound size={17} className="text-[#6D28D9]" />
                <h3 className="font-bold text-[#111827] text-base">
                  {lang === 'sw' ? 'Badilisha PIN ya Tarakimu 4' : '4-Digit Quick PIN Security'}
                </h3>
              </div>
              <span className="badge bg-[#F5F3FF] text-[#6D28D9]">Encrypted PIN</span>
            </div>

            {pinError && (
              <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-2.5 text-xs font-semibold text-[#DC2626]">
                {pinError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{lang === 'sw' ? 'Nywila ya Sasa (Uthibitisho)' : 'Current Password'}</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={pinForm.currentPassword}
                  onChange={(e) => setPinForm({ ...pinForm, currentPassword: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{lang === 'sw' ? 'PIN Mpya (Tarakimu 4)' : 'New 4-Digit PIN'}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  className="input font-bold tracking-widest"
                  placeholder="••••"
                  value={pinForm.newPin}
                  onChange={(e) => setPinForm({ ...pinForm, newPin: e.target.value.replace(/\D/g, '') })}
                />
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button type="submit" disabled={pinLoading} className="btn btn-primary">
                <KeyRound size={15} />
                <span>{lang === 'sw' ? 'Hifadhi PIN Mpya' : 'Update 4-Digit PIN'}</span>
              </button>
            </div>
          </form>

          {/* Secure Password Management Form */}
          <form onSubmit={handlePasswordChange} className="panel p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <Lock size={17} className="text-[#6D28D9]" />
                <h3 className="font-bold text-[#111827] text-base">
                  {lang === 'sw' ? 'Usalama na Kubadili Nywila' : 'Password & Security Management'}
                </h3>
              </div>
              <span className="badge bg-[#F5F3FF] text-[#6D28D9]">SHA-256 Salted Hash</span>
            </div>

            {pwError && (
              <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-2.5 text-xs font-semibold text-[#DC2626]">
                {pwError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">{lang === 'sw' ? 'Nywila ya Sasa' : 'Current Password'}</label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    className="input pr-9"
                    placeholder="••••••••"
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
                  >
                    {showCurrentPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">{lang === 'sw' ? 'Nywila Mpya' : 'New Password'}</label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    className="input pr-9"
                    placeholder="Min. 6 characters"
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
                  >
                    {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">{lang === 'sw' ? 'Thibitisha Nywila Mpya' : 'Confirm New Password'}</label>
                <input
                  type={showNewPw ? 'text' : 'password'}
                  className="input"
                  placeholder="Repeat new password"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                />
              </div>
            </div>

            {pwForm.newPassword && (
              <div className="flex items-center gap-3 text-xs">
                <div className="flex-1 h-1.5 rounded-full bg-[#E5E7EB] overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      pwStrength.score >= 3
                        ? 'w-full bg-[#16A34A]'
                        : pwStrength.score === 2
                          ? 'w-2/3 bg-[#D97706]'
                          : 'w-1/3 bg-[#DC2626]'
                    }`}
                  />
                </div>
                <span
                  className={`font-bold ${
                    pwStrength.score >= 3
                      ? 'text-[#16A34A]'
                      : pwStrength.score === 2
                        ? 'text-[#D97706]'
                        : 'text-[#DC2626]'
                  }`}
                >
                  {pwStrength.message}
                </span>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button type="submit" disabled={pwLoading} className="btn btn-primary">
                <Lock size={15} />
                <span>{lang === 'sw' ? 'Badilisha Nywila' : 'Update Password'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
