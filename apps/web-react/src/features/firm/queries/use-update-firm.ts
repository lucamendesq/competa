import type { UpdateFirmBody } from '@competa/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateFirm } from '@/features/firm/api/update-firm';
import { firmKeys } from '@/features/firm/queries/firm-keys';
import { useSession } from '@/shared/session';

export const useUpdateFirm = () => {
  const queryClient = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: (body: UpdateFirmBody) => updateFirm(body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: firmKeys.detail() }),
        session.refresh(),
      ]),
  });
};
