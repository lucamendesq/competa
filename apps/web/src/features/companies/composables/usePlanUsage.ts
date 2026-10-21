import { useQuery } from '@tanstack/vue-query';
import { getPlanUsage } from '../api/companies';

/** Chave sob o prefixo `companies` de propósito: toda mutação de Empresa já invalida esse
 *  prefixo, então o banner de excedente apaga sozinho ao desativar uma Empresa. */
export const PLAN_USAGE_KEY = ['companies', 'usage'];

export function usePlanUsage() {
  return useQuery({ queryKey: PLAN_USAGE_KEY, queryFn: getPlanUsage });
}
