import * as z from 'zod';

/** Contratos de revisão, pendências e encerramento (Fase 6).
 *  Aceitar Item, encerrar Solicitação/Competência e varrer prazos não têm corpo:
 *  o recurso vem na rota e o ator vem da sessão. */
export const RejectDocumentBody = z.object({
  rejectionReason: z.string().trim().min(3).max(500),
});
export type RejectDocumentBody = z.infer<typeof RejectDocumentBody>;

/** Revisão de Documento Extra: aceitar não precisa de motivo, rejeitar precisa. */
export const ReviewExtraBody = z
  .object({
    decision: z.enum(['accepted', 'rejected']),
    rejectionReason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((v) => v.decision !== 'rejected' || Boolean(v.rejectionReason), {
    message: 'Informe o motivo da rejeição.',
    path: ['rejectionReason'],
  });
export type ReviewExtraBody = z.infer<typeof ReviewExtraBody>;

