import { beforeEach, describe, expect, it } from 'vitest';
import {
  INVITED_KEY,
  useInvitedCompaniesStore,
} from '@/features/companies/store/invited-companies.store';

describe('invited-companies', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useInvitedCompaniesStore.setState({ invitedIds: [] });
  });

  it('markInvited cria um array novo e não duplica', () => {
    const before = useInvitedCompaniesStore.getState().invitedIds;

    useInvitedCompaniesStore.getState().markInvited(['c1', 'c2']);
    useInvitedCompaniesStore.getState().markInvited(['c2']);

    const after = useInvitedCompaniesStore.getState().invitedIds;
    expect(after).toEqual(['c1', 'c2']);
    expect(after).not.toBe(before);
  });

  it('persiste no sessionStorage na mesma chave e no mesmo formato do Vue', () => {
    useInvitedCompaniesStore.getState().markInvited(['c1']);

    expect(INVITED_KEY).toBe('competa_invited_companies');
    expect(JSON.parse(sessionStorage.getItem(INVITED_KEY)!)).toEqual(['c1']);
  });

  it('lê o que o Vue já gravou na sessão', async () => {
    sessionStorage.setItem(INVITED_KEY, JSON.stringify(['c9']));

    await useInvitedCompaniesStore.persist.rehydrate();

    expect(useInvitedCompaniesStore.getState().invitedIds).toEqual(['c9']);
  });
});
