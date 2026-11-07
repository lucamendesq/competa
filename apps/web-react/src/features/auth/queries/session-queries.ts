import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { getMe, getMyProfile } from '@/features/auth/api/auth';
import { authKeys } from '@/features/auth/queries/auth-keys';

const sessionCache = { staleTime: Infinity, gcTime: Infinity, retry: false } as const;

export const meOptions = () =>
  queryOptions({
    queryKey: authKeys.me(),
    queryFn: ({ signal }) => getMe(signal),
    ...sessionCache,
  });

export const contactProfileOptions = () =>
  queryOptions({
    queryKey: authKeys.contactProfile(),
    queryFn: ({ signal }) => getMyProfile(signal),
    ...sessionCache,
  });

export const useMeQuery = () => useQuery(meOptions());

export const useContactProfileQuery = ({ enabled }: { enabled: boolean }) =>
  useQuery({ ...contactProfileOptions(), enabled });

export const useMeSuspense = () => useSuspenseQuery(meOptions()).data;

export const useContactProfileSuspense = () => useSuspenseQuery(contactProfileOptions()).data;
