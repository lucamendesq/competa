import type {
  DeadlineMissedEvent,
  InviteCreatedEvent,
  ItemReopenedEvent,
  RequestCompletedEvent,
  RequestCreatedEvent,
} from '../../lib/events.js';
import { nextDueDate, type ReminderCandidate } from './reminder-rules.js';

/** Dado do usuário (nome, empresa, motivo da rejeição, nome de item) vai para dentro de
 *  HTML: sem escapar, "Zé <b>& Cia</b>" viaja como markup no email. */
const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const asMonth = (referenceMonth: string) => {
  const [year, month] = referenceMonth.split('-');
  return `${month}/${year}`;
};

const asDate = (date: string) => date.split('-').reverse().join('/');

const deadline = (date: string | null) => (date ? `<p>Prazo: <b>${asDate(date)}</b>.</p>` : '');

export const linkDeliveryEmail = (event: RequestCreatedEvent) => ({
  subject: `Documentos de ${asMonth(event.referenceMonth)} — ${escape(event.companyName)}`,
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>Precisamos dos documentos da competência <b>${asMonth(event.referenceMonth)}</b> da empresa
<b>${escape(event.companyName)}</b>: ${event.itemCount} documento(s).</p>
${deadline(event.periodDueDate)}
<p>Envie pelo link (não precisa de senha): <a href="${event.uploadUrl}">${event.uploadUrl}</a></p>`,
});

/** O lembrete leva link novo: o cron rotaciona o `upload_link` antes de enviar, então o
 *  token em claro existe aqui. Sem `uploadUrl` (rotação falhou) cai no texto genérico. */
export const reminderEmail = (
  candidate: ReminderCandidate & {
    companyName: string;
    contactName: string;
    referenceMonth: string;
    uploadUrl?: string;
  },
) => ({
  subject: `Lembrete: documentos pendentes de ${asMonth(candidate.referenceMonth)} — ${escape(candidate.companyName)}`,
  body: `<p>Olá, ${escape(candidate.contactName)}.</p>
<p>Ainda faltam ${candidate.pendingItems.length} documento(s) da competência
<b>${asMonth(candidate.referenceMonth)}</b> da empresa <b>${escape(candidate.companyName)}</b>:</p>
<ul>${candidate.pendingItems
    .map(
      (item) =>
        `<li>${escape(item.name)}${item.dueDate ?? candidate.periodDueDate ? ` — até ${asDate((item.dueDate ?? candidate.periodDueDate)!)}` : ''}</li>`,
    )
    .join('')}</ul>
${deadline(nextDueDate(candidate))}
${
    candidate.uploadUrl
      ? `<p>Envie pelo link (não precisa de senha): <a href="${candidate.uploadUrl}">${candidate.uploadUrl}</a></p>
<p>Este link substitui os anteriores.</p>`
      : '<p>Use o Link de Upload que você já recebeu por email para enviar os arquivos.</p>'
  }`,
});

/** Item rejeitado: o link vai rotacionado pela Fase 6, então este email é o único que
 *  funciona a partir de agora — por isso a reabertura é entregue SÓ por email
 *  (invariante do domínio), nunca por WhatsApp. */
export const itemReopenedEmail = (event: ItemReopenedEvent) => ({
  subject: `Reenvio necessário: ${escape(event.itemName)} — ${escape(event.companyName)}`,
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>O documento <b>${escape(event.itemName)}</b> da empresa <b>${escape(event.companyName)}</b> precisa ser
enviado novamente.</p>
${event.rejectionReason ? `<p>Motivo: ${escape(event.rejectionReason ?? '')}</p>` : ''}
<p>Use este link (o anterior deixou de valer): <a href="${event.uploadUrl}">${event.uploadUrl}</a></p>`,
});

export const requestCompletedEmail = (event: RequestCompletedEvent) => ({
  subject: `Documentos recebidos — ${escape(event.companyName)}`,
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>Recebemos e conferimos todos os documentos da empresa <b>${escape(event.companyName)}</b>.
Nada mais é necessário por agora. Obrigado!</p>`,
});

export const deadlineMissedContactEmail = (event: DeadlineMissedEvent) => ({
  subject: `Prazo vencido: ${escape(event.itemName)} — ${escape(event.companyName)}`,
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>O documento <b>${escape(event.itemName)}</b> venceu em <b>${asDate(event.dueDate)}</b> e ainda não
foi recebido.</p>
<p>Envie pelo link: <a href="${event.uploadUrl}">${event.uploadUrl}</a></p>`,
});

/** O Contador recebe o mesmo fato sem o link de envio: o link é do Responsável. */
export const deadlineMissedAccountantEmail = (event: DeadlineMissedEvent) => ({
  subject: `Prazo vencido: ${escape(event.companyName)} — ${escape(event.itemName)}`,
  body: `<p>A empresa <b>${escape(event.companyName)}</b> não enviou <b>${escape(event.itemName)}</b>, com prazo
em <b>${asDate(event.dueDate)}</b>. O Responsável (${escape(event.contactEmail)}) foi avisado.</p>`,
});

/** Convite de Contador: não passa por `message` (não há Solicitação a que amarrar a
 *  linha — `message.request_id` é not null), então o envio é logado só no Logger. */
export const inviteEmail = (event: InviteCreatedEvent) => ({
  subject: `Você foi convidado para ${escape(event.firmName)}`,
  body: `<p>Olá.</p>
<p>Você foi convidado para acessar o sistema de coleta de documentos de
<b>${escape(event.firmName)}</b>.</p>
<p>Crie sua conta por este link: <a href="${event.inviteUrl}">${event.inviteUrl}</a></p>
<p>O convite expira em ${asDate(event.expiresAt.toISOString().slice(0, 10))}.</p>`,
});

