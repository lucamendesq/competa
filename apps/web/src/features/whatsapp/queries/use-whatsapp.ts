import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { disconnectWhatsApp } from '@/features/whatsapp/api/disconnect-whatsapp';
import { getWhatsAppStatus } from '@/features/whatsapp/api/get-whatsapp-status';
import { onboardWhatsApp } from '@/features/whatsapp/api/onboard-whatsapp';
import { testWhatsApp } from '@/features/whatsapp/api/test-whatsapp';
import { whatsappKeys } from '@/features/whatsapp/queries/whatsapp-keys';

export const useWhatsAppStatus = () =>
  useQuery({ queryKey: whatsappKeys.status(), queryFn: ({ signal }) => getWhatsAppStatus(signal) });

const useInvalidateStatus = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: whatsappKeys.status() });
};

export const useOnboardWhatsApp = () => {
  const invalidate = useInvalidateStatus();
  return useMutation({ mutationFn: onboardWhatsApp, onSuccess: invalidate });
};

export const useDisconnectWhatsApp = () => {
  const invalidate = useInvalidateStatus();
  return useMutation({ mutationFn: disconnectWhatsApp, onSuccess: invalidate });
};

export const useTestWhatsApp = () =>
  useMutation({ mutationFn: (phone: string) => testWhatsApp(phone) });
