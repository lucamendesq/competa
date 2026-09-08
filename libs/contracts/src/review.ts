import * as z from 'zod';

export const RejectDocumentBody = z.object({
  rejectionReason: z.string().trim().min(3).max(500),
});
export type RejectDocumentBody = z.infer<typeof RejectDocumentBody>;

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

/** Revisão em lote: o Contador marca aceites e rejeições na tela e publica tudo de uma
 *  vez. Um único email sai para o Responsável — cinco rejeições eram cinco emails. */
export const ReviewBatchBody = z
  .object({
    acceptItemIds: z.array(z.uuid()).max(200).default([]),
    rejectDocuments: z
      .array(
        z.object({
          documentId: z.uuid(),
          rejectionReason: z.string().trim().min(3).max(500),
        }),
      )
      .max(200)
      .default([]),
    reviewExtras: z
      .array(
        z
          .object({
            documentId: z.uuid(),
            decision: z.enum(['accepted', 'rejected']),
            rejectionReason: z.string().trim().min(3).max(500).optional(),
          })
          .refine((v) => v.decision !== 'rejected' || Boolean(v.rejectionReason), {
            message: 'Informe o motivo da rejeição.',
            path: ['rejectionReason'],
          }),
      )
      .max(200)
      .default([]),
  })
  .refine(
    (v) => v.acceptItemIds.length + v.rejectDocuments.length + v.reviewExtras.length > 0,
    'Nenhuma decisão para publicar.',
  );
export type ReviewBatchBody = z.infer<typeof ReviewBatchBody>;
