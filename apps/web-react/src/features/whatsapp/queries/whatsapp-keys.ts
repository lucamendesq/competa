export const whatsappKeys = {
  all: ['whatsapp'] as const,
  status: () => [...whatsappKeys.all, 'status'] as const,
};
