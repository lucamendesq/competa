/**
 * Script de Verificação Automatizada de Contraste WCAG 2.1 AA
 * Valida os pares de cor fundamentais do novo Design System do Competa.
 *
 * Regras:
 * - Texto normal: Contraste mínimo de 4.5:1 (Nível AA - SC 1.4.3)
 * - Componentes de interface e indicadores de foco: Contraste mínimo de 3.0:1 (Nível AA - SC 1.4.11)
 */

interface ColorPair {
  name: string;
  fg: string;
  bg: string;
  minRatio: number;
  type: 'text' | 'ui';
}

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '').trim();
  const num = parseInt(cleanHex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function channelLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const COLOR_PAIRS: ColorPair[] = [
  {
    name: 'Texto Primário sobre Canvas (#FAFAFA)',
    fg: '#0F172A',
    bg: '#FAFAFA',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Texto Primário sobre Superfície Card (#FFFFFF)',
    fg: '#0F172A',
    bg: '#FFFFFF',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Texto do Botão Primário (#FFFFFF) sobre Âmbar Encorpado (#B45309)',
    fg: '#FFFFFF',
    bg: '#B45309',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Anel de Foco Âmbar (#D97706) sobre Superfície Branca (#FFFFFF)',
    fg: '#D97706',
    bg: '#FFFFFF',
    minRatio: 3.0,
    type: 'ui',
  },
  {
    name: 'Anel de Foco Âmbar (#D97706) sobre Canvas (#FAFAFA)',
    fg: '#D97706',
    bg: '#FAFAFA',
    minRatio: 3.0,
    type: 'ui',
  },
  {
    name: 'Status Pill Neutro: Texto (#334155) sobre (#F1F5F9)',
    fg: '#334155',
    bg: '#F1F5F9',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Status Pill Info: Texto (#075985) sobre (#F0F9FF)',
    fg: '#075985',
    bg: '#F0F9FF',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Status Pill Sucesso: Texto (#065F46) sobre (#ECFDF5)',
    fg: '#065F46',
    bg: '#ECFDF5',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Status Pill Perigo: Texto (#9F1239) sobre (#FFF1F2)',
    fg: '#9F1239',
    bg: '#FFF1F2',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Status Pill Aviso: Texto (#92400E) sobre (#FFFBEB)',
    fg: '#92400E',
    bg: '#FFFBEB',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Status Pill Encerrado: Texto (#475569) sobre (#F1F5F9)',
    fg: '#475569',
    bg: '#F1F5F9',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Hero Institucional: Texto (#FFFFFF) sobre Noite Azulada (#0F172A)',
    fg: '#FFFFFF',
    bg: '#0F172A',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Hero Institucional: Ícones (#FBBF24) sobre Noite Azulada (#0F172A)',
    fg: '#FBBF24',
    bg: '#0F172A',
    minRatio: 4.5,
    type: 'text',
  },
  {
    name: 'Destaque Ativo de Navegação: (#B45309) sobre Âmbar Suave (#FEF3C7)',
    fg: '#B45309',
    bg: '#FEF3C7',
    minRatio: 4.5,
    type: 'text',
  },
];

let failed = false;

console.log('Auditoria Automatizada de Contraste WCAG 2.1 AA\n' + '='.repeat(60));

for (const pair of COLOR_PAIRS) {
  const ratio = contrastRatio(pair.fg, pair.bg);
  const passed = ratio >= pair.minRatio;
  const ratioFormatted = ratio.toFixed(2) + ':1';
  const minFormatted = pair.minRatio.toFixed(1) + ':1';

  if (!passed) {
    failed = true;
    console.error(`❌ FALHA: ${pair.name}`);
    console.error(`   Cores: FG=${pair.fg}, BG=${pair.bg}`);
    console.error(`   Contraste obtido: ${ratioFormatted} (Mínimo exigido: ${minFormatted})\n`);
  } else {
    console.log(`✅ ${pair.name}`);
    console.log(`   FG=${pair.fg} | BG=${pair.bg} -> ${ratioFormatted} (min ${minFormatted})`);
  }
}

console.log('='.repeat(60));

if (failed) {
  console.error('\ncheck-wcag: FALHA na conformidade de contrastes WCAG AA.');
  process.exit(1);
} else {
  console.log('\ncheck-wcag: ok — Todos os pares atendem ou superam WCAG AA.');
  process.exit(0);
}
