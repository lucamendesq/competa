import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resendMessage } from '@/features/messages/api/resend-message';
import { messageKeys } from '@/features/messages/queries/message-keys';

export const useResendMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => resendMessage(messageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messageKeys.lists() }),
  });
};
