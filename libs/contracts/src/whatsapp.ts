import * as z from 'zod';

export const whatsappOnboardSchema = z.object({
  code: z.string().min(1, 'Código de autorização é obrigatório'),
});

export type WhatsappOnboardRequest = z.infer<typeof whatsappOnboardSchema>;

export const whatsappStatusSchema = z.object({
  status: z.enum([
    'not_connected',
    'pending_phone',
    'pending_payment',
    'pending_template',
    'active',
    'suspended',
    'error',
  ]),
  displayPhoneNumber: z.string().optional(),
  wabaId: z.string().optional(),
});

export type WhatsappStatusResponse = z.infer<typeof whatsappStatusSchema>;

export const whatsappTestSendSchema = z.object({
  phone: z.string().min(10, 'Telefone inválido'),
});

export type WhatsappTestSendRequest = z.infer<typeof whatsappTestSendSchema>;
