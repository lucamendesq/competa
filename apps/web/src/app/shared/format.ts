const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Opções de mês para select: valor `01`..`12` (o que a API espera em `YYYY-MM`) e
 *  rótulo em português. */
export const MONTH_OPTIONS = MONTHS.map((label, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label,
}));

/** `2026-07-01` → `Julho/2026`. Sem `Date`: o fuso viraria o mês de referência. */
export const monthLabel = (referenceMonth: string | null | undefined) => {
  if (!referenceMonth) return '—';

  const [year, month] = referenceMonth.split('-');
  return `${MONTHS[Number(month) - 1] ?? month}/${year}`;
};

export const monthShort = (referenceMonth: string | null | undefined) => {
  if (!referenceMonth) return '—';

  const [year, month] = referenceMonth.split('-');
  return `${month}/${year}`;
};

export const dateBr = (isoDate: string | null | undefined) => {
  if (!isoDate) return '—';

  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

export const dateTimeBr = (iso: string | Date | null | undefined) => {
  if (!iso) return '—';

  const value = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(value.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
};

export const fileSize = (bytes: number | null | undefined) => {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

export const maskedCnpj = (cnpj: string | null | undefined) => {
  if (!cnpj) return '—';

  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

export const maskedPhone = (phone: string | null | undefined) => {
  if (!phone) return '—';

  const digits = phone.replace(/\D/g, '').replace(/^55/, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return phone;
};

/** Máscara progressiva pra digitação (o cursor sempre vai pro fim a cada tecla — não
 *  reordena dígitos, só insere separador). Idempotente: aplicar de novo no resultado
 *  não muda nada, porque primeiro tira tudo que não é dígito. */
export const cnpjInputMask = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 14);
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8), digits.slice(8, 12), digits.slice(12, 14)];

  let out = parts[0];
  if (parts[1]) out += `.${parts[1]}`;
  if (parts[2]) out += `.${parts[2]}`;
  if (parts[3]) out += `/${parts[3]}`;
  if (parts[4]) out += `-${parts[4]}`;

  return out;
};

export const phoneInputMask = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  /* 11 dígitos = celular (5+4); até 10 = fixo (4+4). Muda de grupo assim que o 11º
   * dígito aparece, igual todo teclado de celular brasileiro faz. */
  const splitAt = digits.length > 10 ? 5 : 4;
  const part1 = rest.slice(0, splitAt);
  const part2 = rest.slice(splitAt);

  return `(${ddd}) ${part1}${part2 ? `-${part2}` : ''}`;
};

export const todayIso = () => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
};

export const isOverdue = (dueDate: string | null | undefined) =>
  Boolean(dueDate) && dueDate!.slice(0, 10) < todayIso();

export const defaultReferenceMonth = () => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return `${target.getFullYear()}-${`${target.getMonth() + 1}`.padStart(2, '0')}`;
};

export const CATEGORY_LABEL: Record<string, string> = {
  fiscal: 'Fiscal',
  financial: 'Financeiro',
  expense: 'Despesas',
  payroll: 'Folha de pagamento',
  tax: 'Impostos',
  corporate: 'Societário',
};

export const PERIODICITY_LABEL: Record<string, string> = {
  monthly: 'Mensal',
  annual: 'Anual',
  on_demand: 'Sob demanda',
};

export const FLAG_LABEL: Record<string, string> = {
  has_employees: 'Tem funcionários',
  accepts_card_payments: 'Aceita pagamento por cartão',
  has_inventory: 'Controla estoque',
};

export const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
