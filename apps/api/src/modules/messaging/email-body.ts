import type {
  DeadlineMissedEvent,
  ItemReopenedEvent,
  RequestCompletedEvent,
  RequestCreatedEvent,
} from '../../lib/events.js';
import { nextDueDate, type ReminderCandidate } from './reminder-rules.js';

const asMonth = (referenceMonth: string) => {
  const [year, month] = referenceMonth.split('-');
  return `${month}/${year}`;
};

const asDate = (date: string) => date.split('-').reverse().join('/');

const deadline = (date: string | null) => (date ? `<p>Prazo: <b>${asDate(date)}</b>.</p>` : '');

export const linkDeliveryEmail = (event: RequestCreatedEvent) => ({
  subject: `Documentos de ${asMonth(event.referenceMonth)} — ${event.companyName}`,
  body: `<p>Olá, ${event.contactName}.</p>
<p>Precisamos dos documentos da competência <b>${asMonth(event.referenceMonth)}</b> da empresa
<b>${event.companyName}</b>: ${event.itemCount} documento(s).</p>
${deadline(event.periodDueDate)}
<p>Envie pelo link (não precisa de senha): <a href="${event.uploadUrl}">${event.uploadUrl}</a></p>`,
});

/** ponytail: o lembrete não traz link novo — o token em claro só existe na emissão e o
 *  banco guarda só o hash; rotacionar o `upload_link` aqui junto da TASK-028. */
export const reminderEmail = (
  candidate: ReminderCandidate & { companyName: string; contactName: string; referenceMonth: string },
) => ({
  subject: `Lembrete: documentos pendentes de ${asMonth(candidate.referenceMonth)} — ${candidate.companyName}`,
  body: `<p>Olá, ${candidate.contactName}.</p>
<p>Ainda faltam ${candidate.pendingItems.length} documento(s) da competência
<b>${asMonth(candidate.referenceMonth)}</b> da empresa <b>${candidate.companyName}</b>:</p>
<ul>${candidate.pendingItems
    .map(
      (item) =>
        `<li>${item.name}${item.dueDate ?? candidate.periodDueDate ? ` — até ${asDate((item.dueDate ?? candidate.periodDueDate)!)}` : ''}</li>`,
    )
    .join('')}</ul>
${deadline(nextDueDate(candidate))}
<p>Use o Link de Upload que você já recebeu por email para enviar os arquivos.</p>`,
});

/** Item rejeitado: o link vai rotacionado pela Fase 6, então este email é o único que
 *  funciona a partir de agora — por isso a reabertura é entregue SÓ por email
 *  (invariante do domínio), nunca por WhatsApp. */
export const itemReopenedEmail = (event: ItemReopenedEvent) => ({
  subject: `Reenvio necessário: ${event.itemName} — ${event.companyName}`,
  body: `<p>Olá, ${event.contactName}.</p>
<p>O documento <b>${event.itemName}</b> da empresa <b>${event.companyName}</b> precisa ser
enviado novamente.</p>
${event.rejectionReason ? `<p>Motivo: ${event.rejectionReason}</p>` : ''}
<p>Use este link (o anterior deixou de valer): <a href="${event.uploadUrl}">${event.uploadUrl}</a></p>`,
});

export const requestCompletedEmail = (event: RequestCompletedEvent) => ({
  subject: `Documentos recebidos — ${event.companyName}`,
  body: `<p>Olá, ${event.contactName}.</p>
<p>Recebemos e conferimos todos os documentos da empresa <b>${event.companyName}</b>.
Nada mais é necessário por agora. Obrigado!</p>`,
});

export const deadlineMissedContactEmail = (event: DeadlineMissedEvent) => ({
  subject: `Prazo vencido: ${event.itemName} — ${event.companyName}`,
  body: `<p>Olá, ${event.contactName}.</p>
<p>O documento <b>${event.itemName}</b> venceu em <b>${asDate(event.dueDate)}</b> e ainda não
foi recebido.</p>
<p>Envie pelo link: <a href="${event.uploadUrl}">${event.uploadUrl}</a></p>`,
});

/** O Contador recebe o mesmo fato sem o link de envio: o link é do Responsável. */
export const deadlineMissedAccountantEmail = (event: DeadlineMissedEvent) => ({
  subject: `Prazo vencido: ${event.companyName} — ${event.itemName}`,
  body: `<p>A empresa <b>${event.companyName}</b> não enviou <b>${event.itemName}</b>, com prazo
em <b>${asDate(event.dueDate)}</b>. O Responsável (${event.contactEmail}) foi avisado.</p>`,
});
