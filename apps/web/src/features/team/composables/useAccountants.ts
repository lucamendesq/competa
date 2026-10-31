import { useQuery } from '@tanstack/vue-query';
import { getAccountants } from '../api/team';

export const ACCOUNTANTS_KEY = ['accountants'];

export function useAccountants() {
  return useQuery({ queryKey: ACCOUNTANTS_KEY, queryFn: getAccountants });
}
