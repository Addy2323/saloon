import { type ReactNode } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

type Status = 'success' | 'error' | 'pending' | 'low' | 'out' | 'in-stock';

interface StatusBadgeProps {
  status: Status;
  label: string;
}

const styles: Record<Status, string> = {
  success: 'bg-success-100 text-success-700',
  error: 'bg-error-100 text-error-700',
  pending: 'bg-warning-100 text-warning-700',
  low: 'bg-warning-100 text-warning-700',
  out: 'bg-error-100 text-error-700',
  'in-stock': 'bg-success-100 text-success-700',
};

const icons: Record<Status, typeof CheckCircle2 | null> = {
  success: CheckCircle2,
  error: XCircle,
  pending: Clock,
  low: Clock,
  out: XCircle,
  'in-stock': CheckCircle2,
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const Icon = icons[status];
  return (
    <span className={`badge ${styles[status]}`}>
      {Icon && <Icon size={12} />}
      {label}
    </span>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-ink-100 p-5 text-ink-400">{icon}</div>
      <p className="text-lg font-semibold text-ink-700">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
    </div>
  );
}
