import React, { useId, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Lock,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  Sparkles,
  BarChart3,
  Scissors,
  Package,
  Languages,
  CheckCircle2,
  Delete,
  AlertCircle,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import {
  useAuth,
  type IdentifiedAccount,
  type PhoneIdentifyErrorCode,
} from '@/lib/auth';
import { useI18n, type Lang } from '@/lib/i18n';
import { useToast } from '@/components/Toast';

type AuthStep = 'phone' | 'credential' | 'recovery' | 'activate';
type CredentialMethod = 'pin' | 'password';

export function Auth() {
  const {
    identifyUserByPhone,
    authenticateWithPin,
    authenticateWithPassword,
    completeAccountActivation,
    requestRecoveryAssistance,
  } = useAuth();
  const { lang, setLang } = useI18n();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activateTokenParam = searchParams.get('activate') || '';

  const [step, setStep] = useState<AuthStep>(() => (activateTokenParam ? 'activate' : 'phone'));
  const [countryPrefix, setCountryPrefix] = useState('+255');
  const [phoneInput, setPhoneInput] = useState('');
  const [identified, setIdentified] = useState<IdentifiedAccount | null>(null);
  const [credMethod, setCredMethod] = useState<CredentialMethod>('pin');

  const [pinCode, setPinCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState<PhoneIdentifyErrorCode | null>(null);

  // Recovery request state
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recoveryNote, setRecoveryNote] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);

  // One-time invitation activation state
  const [activationToken, setActivationToken] = useState(activateTokenParam);
  const [actPassword, setActPassword] = useState('');
  const [actConfirm, setActConfirm] = useState('');
  const [actPin, setActPin] = useState('');

  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (activateTokenParam) {
      setActivationToken(activateTokenParam);
      setStep('activate');
    }
  }, [activateTokenParam]);

  const toggleLang = () => {
    const next: Lang = lang === 'sw' ? 'en' : 'sw';
    setLang(next);
  };

  // Clear sensitive authentication state when navigating back to Step 1
  const handleChangePhoneNumber = useCallback(() => {
    setPinCode('');
    setPassword('');
    setShowPassword(false);
    setErrorMsg('');
    setErrorCode(null);
    setIdentified(null);
    setStep('phone');
    setTimeout(() => phoneInputRef.current?.focus(), 60);
  }, []);

  // STEP 1: Verify Phone Number
  const handleIdentifyPhone = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setErrorCode(null);

    const raw = phoneInput.trim();
    if (!raw) {
      setErrorCode('EMPTY');
      setErrorMsg(
        lang === 'sw'
          ? 'Tafadhali weka namba yako ya simu iliyosajiliwa.'
          : 'Please enter your registered phone number.',
      );
      return;
    }

    // Combine country code if user typed a 9-digit subscriber number without leading 0 or +
    const combinedPhone =
      raw.startsWith('0') || raw.startsWith('+') || raw.startsWith('255')
        ? raw
        : `${countryPrefix}${raw}`;

    setSubmitting(true);
    const res = await identifyUserByPhone(combinedPhone);
    setSubmitting(false);

    if (!res.ok || !res.account) {
      setErrorCode(res.code || 'NOT_REGISTERED');
      setErrorMsg(
        res.error ||
          'This phone number is not registered in our system. Please check the number and try again. If you need access, contact your administrator.',
      );
      return;
    }

    const acct = res.account;
    setIdentified(acct);
    setPinCode('');
    setPassword('');
    setShowPassword(false);

    // Choose initial method based on administrator policy for this account
    if (acct.authMethods.pin) {
      setCredMethod('pin');
    } else {
      setCredMethod('password');
    }
    setStep('credential');
  };

  // STEP 2A: Verify 4-Digit PIN Passcode
  const submitPin = useCallback(
    async (candidatePin: string) => {
      if (!identified || submitting) return;
      setSubmitting(true);
      setErrorMsg('');
      const res = await authenticateWithPin(identified.id, candidatePin);
      setSubmitting(false);
      if (!res.ok) {
        setErrorMsg(res.error || 'Incorrect PIN. Please try again.');
        setPinCode('');
        return;
      }
      notify(
        lang === 'sw'
          ? `Karibu tena, ${identified.name}!`
          : `Welcome back, ${identified.name}!`,
      );
      navigate('/');
    },
    [identified, submitting, authenticateWithPin, notify, lang, navigate],
  );

  const handlePinDigit = useCallback(
    (digit: string) => {
      if (submitting || pinCode.length >= 4) return;
      const next = pinCode + digit;
      setPinCode(next);
      setErrorMsg('');
      if (next.length === 4) {
        void submitPin(next);
      }
    },
    [pinCode, submitting, submitPin],
  );

  // Device keyboard support for PIN entry in Step 2
  useEffect(() => {
    if (step !== 'credential' || credMethod !== 'pin') return;
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (/^[0-9]$/.test(ev.key)) {
        ev.preventDefault();
        handlePinDigit(ev.key);
      } else if (ev.key === 'Backspace') {
        ev.preventDefault();
        setPinCode((prev) => prev.slice(0, -1));
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        setPinCode('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, credMethod, handlePinDigit]);

  useEffect(() => {
    if (step === 'credential' && credMethod === 'password') {
      setTimeout(() => passwordInputRef.current?.focus(), 60);
    }
  }, [step, credMethod]);

  // STEP 2B: Verify Password Access
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identified || submitting) return;
    setErrorMsg('');
    if (!password) {
      setErrorMsg(
        lang === 'sw'
          ? 'Tafadhali weka nywila ya akaunti yako.'
          : 'Please enter your account password.',
      );
      return;
    }
    setSubmitting(true);
    const res = await authenticateWithPassword(identified.id, password);
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Incorrect password. Please try again.');
      return;
    }
    notify(
      lang === 'sw'
        ? `Karibu tena, ${identified.name}!`
        : `Welcome back, ${identified.name}!`,
    );
    navigate('/');
  };

  // Administrator-Assisted Recovery Request
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    const targetPhone = recoveryPhone.trim() || identified?.displayPhone || phoneInput.trim();
    const res = await requestRecoveryAssistance(targetPhone, recoveryNote);
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Unable to submit recovery request.');
      return;
    }
    setRecoverySent(true);
    notify(
      lang === 'sw'
        ? 'Ombi la msaada limerekodiwa kwa Msimamizi.'
        : 'Recovery assistance request logged for your administrator.',
    );
  };

  // One-Time Account Activation
  const handleCompleteActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!activationToken.trim()) {
      setErrorMsg('Activation token is missing.');
      return;
    }
    if (actPassword !== actConfirm) {
      setErrorMsg(lang === 'sw' ? 'Nywila hazilingani.' : 'Passwords do not match.');
      return;
    }
    if (actPin && actPin.length !== 4) {
      setErrorMsg(lang === 'sw' ? 'PIN lazima iwe na tarakimu 4.' : 'PIN must be 4 digits.');
      return;
    }
    setSubmitting(true);
    const res = await completeAccountActivation(activationToken, actPassword, actPin || undefined);
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Could not activate account.');
      return;
    }
    notify(
      lang === 'sw'
        ? 'Akaunti yako imewashwa kikamilifu! Karibu Lucentia.'
        : 'Account activated! Welcome to Lucentia Beauty & Salon.',
    );
    navigate('/');
  };

  const bothMethodsAvailable =
    !!identified?.authMethods.pin && !!identified?.authMethods.password;

  // Shared inner authentication workflow rendered inside both Mobile Sheet and Desktop Panel
  const authWorkflowContent = (
    <div className="space-y-5">
      {/* ===================================================================
          STEP 1: PHONE NUMBER IDENTIFICATION
      =================================================================== */}
      {step === 'phone' && (
        <form onSubmit={handleIdentifyPhone} className="space-y-4 animate-fade-in" noValidate>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F3FF] border border-[#DDD6FE] px-3 py-1 text-[11px] font-bold text-[#6D28D9] mb-2.5">
              <ShieldCheck size={13} />
              <span>
                {lang === 'sw' ? 'Hatua ya 1 kati ya 2 · Utambulisho' : 'Step 1 of 2 · Staff Identification'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#111827] tracking-tight">
              {lang === 'sw' ? 'Karibu Tena' : 'Welcome Back'}
            </h2>
            <p className="text-xs sm:text-sm text-[#4B5563] mt-1 leading-relaxed">
              {lang === 'sw'
                ? 'Weka namba yako ya simu iliyosajiliwa ili kuingia kwenye akaunti yako ya usimamizi wa saluni.'
                : 'Enter your registered phone number to access your salon management account.'}
            </p>
          </div>

          {/* Structured Error Banner for Step 1 */}
          {errorMsg && (
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-4 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={18} className="text-[#DC2626] shrink-0 mt-0.5" />
                <div className="text-xs text-[#991B1B] leading-relaxed font-semibold">
                  {errorMsg}
                </div>
              </div>
              {(errorCode === 'NOT_REGISTERED' || errorCode === 'INVALID_FORMAT') && (
                <div className="flex flex-wrap items-center gap-2 pt-1 pl-6">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setErrorCode(null);
                      phoneInputRef.current?.focus();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#FCA5A5] text-[11px] font-bold text-[#B91C1C] hover:bg-[#FEE2E2] transition"
                  >
                    {lang === 'sw' ? 'Hariri Namba ya Simu' : 'Edit Phone Number'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleIdentifyPhone()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#DC2626] text-[11px] font-bold text-white hover:bg-[#B91C1C] transition"
                  >
                    <RefreshCw size={11} />
                    <span>{lang === 'sw' ? 'Jaribu Tena' : 'Try Again'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="label">
              {lang === 'sw' ? 'Namba ya Simu Iliyosajiliwa' : 'Registered Phone Number'}
            </label>
            <div className="flex gap-2">
              <select
                aria-label="Country code"
                value={countryPrefix}
                onChange={(e) => setCountryPrefix(e.target.value)}
                className="input w-[104px] shrink-0 font-bold text-xs px-2.5 bg-[#F9FAFB]"
              >
                <option value="+255">🇹🇿 +255</option>
                <option value="+254">🇰🇪 +254</option>
                <option value="+256">🇺🇬 +256</option>
              </select>
              <div className="relative flex-1">
                <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                <input
                  ref={phoneInputRef}
                  type="tel"
                  autoComplete="tel"
                  required
                  className="input pl-10 font-semibold tracking-wide"
                  placeholder={
                    lang === 'sw'
                      ? 'Weka namba yako ya simu iliyosajiliwa'
                      : 'Enter your registered phone number'
                  }
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    if (errorMsg) {
                      setErrorMsg('');
                      setErrorCode(null);
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary w-full py-3 text-sm shadow-md"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{lang === 'sw' ? 'Inahakiki...' : 'Verifying Account...'}</span>
              </span>
            ) : (
              <>
                <span>{lang === 'sw' ? 'Endelea Kuingia' : 'Continue to Sign In'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Administrator-Controlled Access Notice (No Public Registration) */}
          <div className="pt-4 mt-2 border-t border-[#E5E7EB] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#6B7280]">
            <span>
              {lang === 'sw'
                ? 'Unahitaji akaunti ya kuingia? Tafadhali wasiliana na msimamizi wako.'
                : 'Need account access? Please contact your administrator.'}
            </span>
            <button
              type="button"
              onClick={() => {
                setRecoveryPhone(phoneInput);
                setRecoverySent(false);
                setErrorMsg('');
                setStep('recovery');
              }}
              className="inline-flex items-center gap-1 font-bold text-[#6D28D9] hover:underline shrink-0"
            >
              <HelpCircle size={13} />
              <span>{lang === 'sw' ? 'Umesahau PIN / Nywila?' : 'Forgot PIN / Password?'}</span>
            </button>
          </div>
        </form>
      )}

      {/* ===================================================================
          STEP 2: PIN PASSCODE OR PASSWORD ACCESS
      =================================================================== */}
      {step === 'credential' && identified && (
        <div className="space-y-4 animate-fade-in">
          {/* Identified User Identity Card */}
          <div className="rounded-2xl bg-gradient-to-br from-[#FAF8FF] to-[#F5F3FF] border border-[#DDD6FE] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {identified.avatar ? (
                  <img
                    src={identified.avatar}
                    alt={identified.name}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-[#6D28D9]/40 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#6D28D9] text-[#FAE29C] font-extrabold text-sm flex items-center justify-center shrink-0">
                    {identified.initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#6D28D9]">
                    {lang === 'sw' ? 'Karibu tena!' : 'Welcome back!'}
                  </p>
                  <h3 className="text-base font-extrabold text-[#111827] truncate">
                    {identified.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono font-bold text-[#374151]">
                      {identified.displayPhone}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-[#DDD6FE] text-[#6D28D9]">
                      {identified.roleTitle}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleChangePhoneNumber}
                className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-white border border-[#DDD6FE] px-2.5 py-1.5 text-[11px] font-bold text-[#6D28D9] hover:bg-[#EDE9FE] transition"
              >
                <ArrowLeft size={12} />
                <span>{lang === 'sw' ? 'Badili Namba' : 'Change Phone'}</span>
              </button>
            </div>
          </div>

          {/* Method Switcher Tabs — Shown when both PIN & Password are enabled for the account */}
          {bothMethodsAvailable && (
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-1">
              <button
                type="button"
                onClick={() => {
                  setCredMethod('pin');
                  setErrorMsg('');
                  setPinCode('');
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition ${
                  credMethod === 'pin'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                <KeyRound size={14} />
                <span>{lang === 'sw' ? 'PIN ya Tarakimu 4' : 'PIN Passcode'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCredMethod('password');
                  setErrorMsg('');
                  setPinCode('');
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition ${
                  credMethod === 'password'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] text-white shadow-xs'
                    : 'text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                <Lock size={14} />
                <span>{lang === 'sw' ? 'Nywila ya Akaunti' : 'Password Access'}</span>
              </button>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 flex items-start gap-2.5 text-xs font-semibold text-[#DC2626]">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* OPTION A: 4-DIGIT PIN PASSCODE */}
          {credMethod === 'pin' && identified.authMethods.pin && (
            <div className="space-y-4 text-center pt-1">
              <div>
                <h4 className="text-base font-extrabold text-[#111827]">
                  {lang === 'sw' ? 'PIN ya Siri (PIN Passcode)' : 'PIN Passcode'}
                </h4>
                <p className="text-xs text-[#4B5563] mt-0.5">
                  {lang === 'sw'
                    ? 'Weka PIN yako ya tarakimu 4 kuendelea.'
                    : 'Enter your 4-digit PIN to continue.'}
                </p>
              </div>

              {/* 4 Visual PIN Indicators */}
              <div className="flex justify-center gap-3.5 py-1">
                {[0, 1, 2, 3].map((i) => {
                  const filled = i < pinCode.length;
                  return (
                    <div
                      key={i}
                      className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-lg font-extrabold transition-all ${
                        filled
                          ? 'border-[#6D28D9] bg-[#F5F3FF] text-[#6D28D9] scale-105 shadow-xs'
                          : 'border-[#E5E7EB] bg-[#F9FAFB] text-transparent'
                      }`}
                    >
                      ●
                    </div>
                  );
                })}
              </div>

              {/* Numeric Keypad (0-9, Clear, Backspace) */}
              <div className="grid grid-cols-3 gap-2.5 max-w-[270px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    disabled={submitting}
                    onClick={() => handlePinDigit(digit)}
                    className="h-12 rounded-2xl border border-[#E5E7EB] bg-white text-lg font-extrabold text-[#111827] hover:bg-[#F5F3FF] hover:border-[#DDD6FE] hover:text-[#6D28D9] active:scale-95 transition shadow-2xs disabled:opacity-50"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setPinCode('');
                    setErrorMsg('');
                  }}
                  className="h-12 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs font-bold text-[#4B5563] hover:bg-gray-100 disabled:opacity-50"
                >
                  {lang === 'sw' ? 'FUTA' : 'CLR'}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handlePinDigit('0')}
                  className="h-12 rounded-2xl border border-[#E5E7EB] bg-white text-lg font-extrabold text-[#111827] hover:bg-[#F5F3FF] hover:border-[#DDD6FE] hover:text-[#6D28D9] active:scale-95 transition shadow-2xs disabled:opacity-50"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setPinCode((p) => p.slice(0, -1))}
                  className="h-12 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] flex items-center justify-center text-[#4B5563] hover:bg-gray-100 disabled:opacity-50"
                  aria-label="Backspace"
                >
                  <Delete size={18} />
                </button>
              </div>

              {submitting && (
                <div className="inline-flex items-center gap-2 text-xs font-bold text-[#6D28D9]">
                  <span className="w-4 h-4 border-2 border-[#DDD6FE] border-t-[#6D28D9] rounded-full animate-spin" />
                  <span>{lang === 'sw' ? 'Inathibitisha PIN...' : 'Verifying PIN...'}</span>
                </div>
              )}
            </div>
          )}

          {/* OPTION B: PASSWORD ACCESS */}
          {credMethod === 'password' && identified.authMethods.password && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-1">
              <div>
                <h4 className="text-base font-extrabold text-[#111827]">
                  {lang === 'sw' ? 'Ufikiaji wa Nywila (Password Access)' : 'Password Access'}
                </h4>
                <p className="text-xs text-[#4B5563] mt-0.5">
                  {lang === 'sw'
                    ? 'Weka nywila ya akaunti yako kuendelea.'
                    : 'Enter your account password to continue.'}
                </p>
              </div>

              <div>
                <label className="label">{lang === 'sw' ? 'Nywila ya Akaunti' : 'Account Password'}</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    className="input pl-10 pr-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111827]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3 text-sm">
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{lang === 'sw' ? 'Inathibitisha...' : 'Signing In...'}</span>
                  </span>
                ) : (
                  <>
                    <span>{lang === 'sw' ? 'Ingia Kwenye Dashibodi' : 'Sign In to Dashboard'}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Controls: Change Phone Number & Request Admin Recovery */}
          <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleChangePhoneNumber}
              className="font-semibold text-[#4B5563] hover:text-[#111827] inline-flex items-center gap-1"
            >
              <ArrowLeft size={13} />
              <span>{lang === 'sw' ? 'Badili Namba ya Simu' : 'Change Phone Number'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRecoveryPhone(identified.displayPhone);
                setRecoverySent(false);
                setErrorMsg('');
                setStep('recovery');
              }}
              className="font-bold text-[#6D28D9] hover:underline"
            >
              {lang === 'sw' ? 'Umesahau PIN au Nywila?' : 'Forgot PIN or Password?'}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================
          ADMINISTRATOR-ASSISTED CREDENTIAL RECOVERY
      =================================================================== */}
      {step === 'recovery' && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#111827]">
              {lang === 'sw' ? 'Msaada wa Kurejesha PIN au Nywila' : 'PIN & Password Recovery Assistance'}
            </h2>
            <p className="text-xs text-[#4B5563] mt-1 leading-relaxed">
              {lang === 'sw'
                ? 'Kwa usalama wa saluni, uwekaji upya wa PIN na nywila unadhibitiwa na Msimamizi wa Saluni. Tuma ombi lako hapa ili msimamizi akutumie ufunguo mpya kupitia WhatsApp.'
                : 'For salon security, PIN and password resets are managed by your Salon Administrator. Submit your registered phone number below to notify the administrator.'}
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs font-semibold text-[#DC2626]">
              {errorMsg}
            </div>
          )}

          {recoverySent ? (
            <div className="rounded-2xl bg-[#F0FDF4] border border-[#86EFAC] p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={18} className="text-[#16A34A] shrink-0 mt-0.5" />
                <div className="text-xs text-[#14532D] leading-relaxed">
                  <p className="font-extrabold">
                    {lang === 'sw' ? 'Ombi Limepokelewa!' : 'Assistance Request Logged'}
                  </p>
                  <p className="mt-0.5">
                    {lang === 'sw'
                      ? 'Msimamizi wako ataona ombi hili kwenye Kumbukumbu za Usalama na anaweza kukuwekea PIN au nywila mpya mara moja.'
                      : 'Your administrator has been notified in the Security Audit Trail and can issue a new PIN or temporary password via WhatsApp.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleChangePhoneNumber}
                className="btn btn-primary w-full text-xs py-2.5"
              >
                {lang === 'sw' ? 'Rudi Kwenye Kuingia' : 'Return to Sign In'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleRecoverySubmit} className="space-y-3.5">
              <div>
                <label className="label">
                  {lang === 'sw' ? 'Namba ya Simu Iliyosajiliwa' : 'Registered Phone Number'}
                </label>
                <input
                  type="tel"
                  required
                  className="input font-semibold"
                  placeholder={
                    lang === 'sw'
                      ? 'Weka namba yako ya simu iliyosajiliwa'
                      : 'Enter your registered phone number'
                  }
                  value={recoveryPhone}
                  onChange={(e) => setRecoveryPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="label">
                  {lang === 'sw' ? 'Maelezo Mafupi (Hiari)' : 'Message for Administrator (Optional)'}
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder={lang === 'sw' ? 'Mfano: Nimesahau PIN yangu ya tarakimu 4' : 'e.g., Forgot my 4-digit PIN'}
                  value={recoveryNote}
                  onChange={(e) => setRecoveryNote(e.target.value)}
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setStep(identified ? 'credential' : 'phone');
                  }}
                  className="btn btn-secondary flex-1"
                >
                  {lang === 'sw' ? 'Rudi' : 'Back'}
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary flex-1">
                  {lang === 'sw' ? 'Tuma Ombi' : 'Request Reset'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ===================================================================
          ONE-TIME STAFF INVITATION ACTIVATION (?activate=<token>)
      =================================================================== */}
      {step === 'activate' && (
        <form onSubmit={handleCompleteActivation} className="space-y-4 animate-fade-in">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#111827]">
              {lang === 'sw' ? 'Kamilisha Usajili wa Akaunti Yako' : 'Activate Your Staff Account'}
            </h2>
            <p className="text-xs text-[#4B5563] mt-0.5">
              {lang === 'sw'
                ? 'Weka nywila yako binafsi na PIN ya tarakimu 4 kuwasha akaunti uliyopewa na msimamizi.'
                : 'Set your personal password and 4-digit PIN to complete your administrator-invited account setup.'}
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs font-semibold text-[#DC2626]">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="label">{lang === 'sw' ? 'Nywila Mpya' : 'Create Personal Password'}</label>
            <input
              type="password"
              required
              minLength={6}
              className="input"
              placeholder="Min. 6 characters"
              value={actPassword}
              onChange={(e) => setActPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="label">{lang === 'sw' ? 'Thibitisha Nywila' : 'Confirm Password'}</label>
            <input
              type="password"
              required
              minLength={6}
              className="input"
              placeholder="Repeat password"
              value={actConfirm}
              onChange={(e) => setActConfirm(e.target.value)}
            />
          </div>

          <div>
            <label className="label">{lang === 'sw' ? 'PIN ya Tarakimu 4' : '4-Digit Quick PIN'}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              required
              className="input font-bold tracking-widest"
              placeholder="••••"
              value={actPin}
              onChange={(e) => setActPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3 text-sm">
            <CheckCircle2 size={16} />
            <span>{lang === 'sw' ? 'Washa Akaunti na Ingia' : 'Activate Account & Sign In'}</span>
          </button>

          <button
            type="button"
            onClick={handleChangePhoneNumber}
            className="w-full text-center text-xs font-semibold text-[#6D28D9] hover:underline pt-1"
          >
            {lang === 'sw' ? '← Rudi kwenye ukurasa wa Kuingia' : '← Back to Phone Sign In'}
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#1F2937]">
      {/* =====================================================================
          DEDICATED MOBILE AUTH LAYOUT (< lg)
      ===================================================================== */}
      <div className="lg:hidden min-h-screen flex flex-col bg-[#171021] sidebar-dotted">
        <div className="relative px-5 pt-6 pb-11 text-white overflow-hidden">
          <div className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full bg-[#D4A24C]/20 blur-2xl" />
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[11px] font-semibold text-[#FAE29C]">
              <Sparkles size={12} />
              <span>Lucentia Staff Portal</span>
            </div>
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1.5 text-xs font-bold text-white"
            >
              <Languages size={14} className="text-[#FAE29C]" />
              <span>{lang === 'sw' ? 'EN' : 'SW'}</span>
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3.5">
            <LucentiaEmblem className="w-14 h-14" />
            <div>
              <p className="font-display text-2xl font-bold tracking-[0.14em] bg-gradient-to-r from-[#fae29c] via-[#e2b45a] to-[#c58e2d] bg-clip-text text-transparent">
                LUCENTIA
              </p>
              <p className="text-xs text-white/80">Beauty &amp; Salon Management</p>
              <p className="text-[11px] font-display italic text-[#F5D68A] mt-0.5">
                {lang === 'sw' ? 'Kuza Biashara Yako ya Saluni' : 'Grow Your Salon Business'}
              </p>
            </div>
          </div>
        </div>

        {/* Mobile Bottom-Sheet White Card */}
        <div className="flex-1 bg-[#FFFFFF] rounded-t-[28px] -mt-5 px-5 pt-6 pb-8 shadow-[0_-8px_30px_rgba(0,0,0,0.25)] flex flex-col justify-between">
          <div className="w-12 h-1.5 rounded-full bg-[#E5E7EB] mx-auto mb-5" />
          <div className="max-w-md w-full mx-auto flex-1">{authWorkflowContent}</div>
          <p className="mt-6 text-center text-[11px] text-[#6B7280]">
            © {new Date().getFullYear()} <strong className="text-[#1F2937]">Lucentia Beauty &amp; Salon</strong> ·{' '}
            {lang === 'sw' ? 'Mfumo Unaodhibitiwa na Msimamizi' : 'Administrator-Controlled Access'}
          </p>
        </div>
      </div>

      {/* =====================================================================
          DESKTOP SPLIT-SCREEN AUTH LAYOUT (lg+)
      ===================================================================== */}
      <div className="hidden lg:flex min-h-screen flex-row">
        {/* Left Showcase Panel — Dark (#171021) with subtle dotted texture */}
        <div className="relative lg:w-[46%] xl:w-[44%] bg-[#171021] sidebar-dotted text-white flex flex-col justify-between p-12 overflow-hidden select-none">
          <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#6D28D9]/25 blur-3xl" />
          <div className="pointer-events-none absolute bottom-10 -right-20 w-80 h-80 rounded-full bg-[#D4A24C]/15 blur-3xl" />

          <div className="relative z-10 flex items-center gap-4">
            <LucentiaEmblem className="w-14 h-14" />
            <div>
              <p className="font-display text-3xl font-bold tracking-[0.14em] bg-gradient-to-r from-[#fae29c] via-[#e2b45a] to-[#c58e2d] bg-clip-text text-transparent">
                LUCENTIA
              </p>
              <p className="text-xs text-white/75 tracking-widest uppercase">Beauty &amp; Salon Management</p>
            </div>
          </div>

          <div className="relative z-10 my-auto space-y-6 max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-[#FAE29C]">
              <Sparkles size={14} />
              <span>{lang === 'sw' ? 'Mfumo wa Kisasa wa Usimamizi wa Saluni' : 'Executive Salon Management Portal'}</span>
            </div>

            <h1 className="text-4xl font-extrabold leading-tight text-white">
              {lang === 'sw' ? (
                <>
                  Kuza Biashara Yako ya Saluni{' '}
                  <span className="font-display italic font-normal text-[#F5D68A]">na Lucentia</span>
                </>
              ) : (
                <>
                  Grow Your Salon Business{' '}
                  <span className="font-display italic font-normal text-[#F5D68A]">with Lucentia</span>
                </>
              )}
            </h1>

            <p className="text-sm text-white/80 leading-relaxed">
              {lang === 'sw'
                ? 'Ufikiaji salama kwa wafanyakazi na wasimamizi waliosajiliwa. Fuatilia stoo, manunuzi, matumizi, huduma za wateja na faida halisi ya saluni yako.'
                : 'Secure, administrator-controlled portal for registered salon staff and management. Track inventory, purchases, daily expenses, services, and real-time profit.'}
            </p>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-3.5">
                <Package size={18} className="text-[#F5D68A] mb-2" />
                <p className="text-xs font-bold text-white">
                  {lang === 'sw' ? 'Stoo na Manunuzi' : 'Stock & Purchases'}
                </p>
                <p className="text-[11px] text-white/65 mt-0.5">
                  {lang === 'sw' ? 'Ufuatiliaji wa bidhaa' : 'Live stock alerts'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-3.5">
                <Scissors size={18} className="text-[#A78BFA] mb-2" />
                <p className="text-xs font-bold text-white">
                  {lang === 'sw' ? 'Huduma na Mauzo' : 'Services & Sales'}
                </p>
                <p className="text-[11px] text-white/65 mt-0.5">
                  {lang === 'sw' ? 'Rekodi za wateja' : 'Daily styling ledger'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-3.5">
                <BarChart3 size={18} className="text-[#34D399] mb-2" />
                <p className="text-xs font-bold text-white">
                  {lang === 'sw' ? 'Faida na Ripoti' : 'Profit & Audit'}
                </p>
                <p className="text-[11px] text-white/65 mt-0.5">
                  {lang === 'sw' ? 'Uchambuzi wa fedha' : 'Real-time net P&L'}
                </p>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-3 text-xs text-white/70">
            <ShieldCheck size={16} className="text-[#F5D68A]" />
            <span>
              {lang === 'sw'
                ? 'Ulinzi wa Hatua 2 (Namba ya Simu + PIN/Nywila) · Akaunti Zinazodhibitiwa na Msimamizi'
                : 'Two-Step Verification (Registered Phone + PIN/Password) · Administrator-Controlled Accounts'}
            </span>
          </div>
        </div>

        {/* Right Form Panel — Pure White (#FFFFFF) */}
        <div className="flex-1 flex flex-col justify-between p-10 bg-[#FFFFFF]">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F2937] hover:bg-gray-50 shadow-soft"
            >
              <Languages size={15} className="text-[#6D28D9]" />
              <span>{lang === 'sw' ? 'Switch to English' : 'Badili kwenda Kiswahili'}</span>
            </button>
          </div>

          <div className="w-full max-w-[440px] mx-auto my-auto">
            <div className="rounded-3xl bg-white border border-[#E5E7EB] shadow-[0_8px_32px_-8px_rgba(17,24,39,0.08)] p-8">
              {authWorkflowContent}
            </div>
          </div>

          <p className="text-center text-xs text-[#6B7280]">
            © {new Date().getFullYear()} <strong className="text-[#1F2937]">Lucentia Beauty &amp; Salon</strong> —{' '}
            {lang === 'sw'
              ? 'Unahitaji ufikiaji? Wasiliana na msimamizi wako.'
              : 'Need account access? Please contact your administrator.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function LucentiaEmblem({ className = 'w-14 h-14' }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const gradId = `authGoldGrad-${uid}`;
  return (
    <svg viewBox="0 0 96 96" className={`${className} drop-shadow-[0_4px_12px_rgba(212,162,76,0.35)]`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fae29c" />
          <stop offset="50%" stopColor="#d4a24c" />
          <stop offset="100%" stopColor="#9c6b1c" />
        </linearGradient>
      </defs>
      <path d="M34 22 L40 13 L48 20 L56 13 L62 22 Z" fill={`url(#${gradId})`} />
      <circle cx="40" cy="11" r="2" fill="#fae29c" />
      <circle cx="48" cy="10" r="2.3" fill="#fae29c" />
      <circle cx="56" cy="11" r="2" fill="#fae29c" />
      <circle cx="48" cy="54" r="30" fill="none" stroke={`url(#${gradId})`} strokeWidth="2.5" />
      <path
        d="M34 44 C34 33, 52 30, 58 40 C64 50, 59 66, 48 74 C53 65, 54 55, 48 50 C43 46, 39 51, 40 57 C35 53, 34 48, 34 44 Z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M44 37 C52 37, 58 45, 55 56 C53 63, 46 69, 39 72 C45 66, 49 58, 47 51 C45 45, 41 42, 44 37 Z"
        fill="#fae29c"
        opacity="0.85"
      />
    </svg>
  );
}
