import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

type InvitedCompaniesState = {
  invitedIds: string[];
  markInvited: (ids: string[]) => void;
};

type PersistedState = Pick<InvitedCompaniesState, 'invitedIds'>;

export const INVITED_KEY = 'competa_invited_companies';

const legacyArrayStorage: PersistStorage<PersistedState> = {
  getItem: (name) => {
    try {
      const raw = sessionStorage.getItem(name);
      const invitedIds = raw ? (JSON.parse(raw) as unknown) : [];
      return { state: { invitedIds: Array.isArray(invitedIds) ? invitedIds.map(String) : [] } };
    } catch {
      return null;
    }
  },
  setItem: (name, value: StorageValue<PersistedState>) => {
    try {
      sessionStorage.setItem(name, JSON.stringify(value.state.invitedIds));
    } catch {
      return;
    }
  },
  removeItem: (name) => {
    try {
      sessionStorage.removeItem(name);
    } catch {
      return;
    }
  },
};

export const useInvitedCompaniesStore = create<InvitedCompaniesState>()(
  persist(
    (set) => ({
      invitedIds: [],
      markInvited: (ids) =>
        set((state) => ({ invitedIds: [...new Set([...state.invitedIds, ...ids])] })),
    }),
    {
      name: INVITED_KEY,
      storage: legacyArrayStorage,
      partialize: (state) => ({ invitedIds: state.invitedIds }),
    },
  ),
);

export const useIsInvited = (id: string) =>
  useInvitedCompaniesStore((state) => state.invitedIds.includes(id));

export const useMarkInvited = () => useInvitedCompaniesStore((state) => state.markInvited);
