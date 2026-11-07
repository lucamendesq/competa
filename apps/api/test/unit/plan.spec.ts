import {
  PLANS,
  planAllows,
  planCompanyCap,
  planForCompanies,
  planPrice,
  planRequiredFor,
  planSoftCap,
} from '@competa/contracts';
import { describe, expect, it } from 'vitest';

describe('catálogo de planos (D18)', () => {
  it('tetos e folga', () => {
    expect(planCompanyCap('profissional')).toBe(80);
    expect(planCompanyCap('plano-que-nao-existe')).toBe(PLANS.trial.companyCap);
    expect(planSoftCap(PLANS.essencial.companyCap)).toBe(36);
    expect(planSoftCap(PLANS.profissional.companyCap)).toBe(96);
  });

  it('capabilities: Essencial sem os gates, plano desconhecido nega tudo', () => {
    expect(planAllows('essencial', 'branding')).toBe(false);
    expect(planAllows('profissional', 'periodZip')).toBe(true);
    expect(planAllows('trial', 'reminderTuning')).toBe(true);
    expect(planAllows('xpto-inexistente', 'periodZip')).toBe(false);
    expect(planRequiredFor('periodZip')).toBe('profissional');
  });

  it('anual é 10× o mensal, com e sem o preço de fundador', () => {
    expect(planPrice(PLANS.profissional, 'yearly')).toBe(1890);
    expect(planPrice(PLANS.profissional, 'monthly', 139)).toBe(139);
    expect(planPrice(PLANS.escritorio, 'yearly', 219)).toBe(2190);
  });

  it('recomenda o plano mais barato que cobre as ativas', () => {
    expect(planForCompanies(34)).toBe('profissional');
    expect(planForCompanies(30)).toBe('essencial');
    expect(planForCompanies(500)).toBe('escritorio');
  });
});
