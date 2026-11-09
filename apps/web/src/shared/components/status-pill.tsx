import {
  Check,
  CircleCheck,
  CircleSlash,
  Clock,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  SquareCheckBig,
  TriangleAlert,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type Tone = 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'closed';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  pending: { label: 'Pendente', tone: 'neutral', icon: Clock },
  submitted: { label: 'Enviado', tone: 'info', icon: Upload },
  accepted: { label: 'Aceito', tone: 'success', icon: Check },
  rejected: { label: 'Rejeitado', tone: 'danger', icon: X },
  open: { label: 'Aberta', tone: 'info', icon: Upload },
  complete: { label: 'Completa', tone: 'success', icon: CircleCheck },
  closed: { label: 'Encerrada', tone: 'closed', icon: Lock },
  overdue: { label: 'Atrasado', tone: 'warning', icon: Clock },
  queued: { label: 'Na fila', tone: 'neutral', icon: Clock },
  sent: { label: 'Enviada', tone: 'info', icon: Upload },
  delivered: { label: 'Entregue', tone: 'success', icon: CircleCheck },
  failed: { label: 'Falhou', tone: 'danger', icon: TriangleAlert },
  inactive: { label: 'Inativa', tone: 'closed', icon: CircleSlash },
  active: { label: 'Ativa', tone: 'success', icon: CircleCheck },
  extra: { label: 'Documento extra', tone: 'info', icon: Upload },
  resent: { label: 'Reenviado', tone: 'warning', icon: RotateCcw },
  removed: { label: 'Removido', tone: 'warning', icon: Minus },
  added: { label: 'Adicionado', tone: 'info', icon: Plus },
  not_applicable: { label: 'Não se aplica', tone: 'neutral', icon: CircleSlash },
  own_template: { label: 'Meu modelo', tone: 'info', icon: SquareCheckBig },
  connected: { label: 'Ativo', tone: 'success', icon: CircleCheck },
  disconnected: { label: 'Não conectado', tone: 'closed', icon: CircleSlash },
};

type StatusPillProps = { status: string; text?: string; title?: string };

export function StatusPill({ status, text, title }: StatusPillProps) {
  const entry = STATUS[status] ?? { label: status, tone: 'neutral' as const, icon: Clock };
  const Icon = entry.icon;

  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold',
        TONE_CLASS[entry.tone],
      )}
      title={title}
    >
      <Icon className="size-3" aria-hidden="true" />
      {text ?? entry.label}
    </span>
  );
}
