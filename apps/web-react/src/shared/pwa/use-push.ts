import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/shared/lib/api-client';
import { apiErrorMessage } from '@/shared/lib/api-error';
import {
  bytesFromBase64,
  payloadOf,
  pushSupported,
  serviceWorkerReady,
  type PushSubscriptionPayload,
} from '@/shared/pwa/push';
import { pwaKeys } from '@/shared/pwa/pwa-keys';

class PermissionDenied extends Error {}

export function usePush(save: (payload: PushSubscriptionPayload) => Promise<unknown>) {
  const queryClient = useQueryClient();
  const supported = pushSupported();

  const vapidKey = useQuery({
    queryKey: pwaKeys.vapidKey(),
    queryFn: () => api.get<{ key: string }>('/push/vapid-key').then((res) => res.key),
    staleTime: 'static',
    enabled: supported,
  });

  const subscription = useQuery({
    queryKey: pwaKeys.subscription(),
    queryFn: async () => {
      const registration = await navigator.serviceWorker.ready;
      return (await registration.pushManager.getSubscription()) !== null;
    },
    enabled: supported,
  });

  const subscribe = useMutation({
    mutationFn: async () => {
      if ((await Notification.requestPermission()) !== 'granted') throw new PermissionDenied();
      const registration = await serviceWorkerReady(navigator.serviceWorker.ready);
      const created = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytesFromBase64(vapidKey.data ?? ''),
      });
      await save(payloadOf(created));
    },
    onSuccess: () => {
      toast.success('Avisos ligados neste aparelho.');
      return queryClient.invalidateQueries({ queryKey: pwaKeys.subscription() });
    },
    onError: (error) => {
      if (error instanceof PermissionDenied) {
        toast.info('As notificações ficaram bloqueadas neste aparelho.');
        return;
      }
      toast.error(apiErrorMessage(error, 'Não foi possível ligar os avisos.'));
    },
  });

  return {
    available: Boolean(vapidKey.data),
    subscribed: subscription.data === true,
    subscribing: subscribe.isPending,
    subscribe: () => {
      if (vapidKey.data) subscribe.mutate();
    },
  };
}
