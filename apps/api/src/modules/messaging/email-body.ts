import type {
  ContactInvitedEvent,
  DeadlineMissedEvent,
  InviteCreatedEvent,
  ItemReopenedEvent,
  RequestCompletedEvent,
  ReviewPublishedEvent,
  RequestCreatedEvent,
  UploadLinkResentEvent,
} from '../../lib/events.js';
import { nextDueDate, type ReminderCandidate } from './reminder-rules.js';
import { escape, linkButton } from './email-layout.js';

export const asMonth = (referenceMonth: string) => {
  const [year, month] = referenceMonth.split('-');
  return `${month}/${year}`;
};

const asDate = (date: string) => date.split('-').reverse().join('/');

const deadline = (date: string | null) => (date ? `<p>Prazo: <b>${asDate(date)}</b>.</p>` : '');

export const accessInviteEmail = (event: ContactInvitedEvent) => ({
  subject: 'Ative seu acesso e veja o histórico',
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>A <b>${escape(event.firmName)}</b> usa este sistema para receber os documentos contábeis
de <b>${escape(event.companyName)}</b>. Você continua podendo enviar tudo pelo link que
chega por email, sem senha — mas se quiser, pode ativar um acesso e passar a ver o
histórico das competências anteriores e receber aviso no celular.</p>
${linkButton(event.inviteUrl, 'Ativar acesso')}
<p style="color:#64748b;font-size:12px">Este convite vale até
${asDate(event.expiresAt.toISOString().slice(0, 10))} e não é obrigatório.</p>`,
});

export const linkResentEmail = (event: UploadLinkResentEvent) => ({
  subject: `Seu novo link de envio — ${asMonth(event.referenceMonth)}`,
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>Aqui está o link para enviar os documentos da competência
<b>${asMonth(event.referenceMonth)}</b> de <b>${escape(event.companyName)}</b>.</p>
${deadline(event.periodDueDate)}
${linkButton(event.uploadUrl, 'Enviar documentos')}
<p style="color:#64748b;font-size:12px">O link anterior deixou de funcionar. Se não foi você
que pediu, ignore este email.</p>`,
});

export const linkDeliveryEmail = (event: RequestCreatedEvent) => ({
  subject: `Envie os documentos de ${asMonth(event.referenceMonth)}`,
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>Precisamos dos documentos da competência <b>${asMonth(event.referenceMonth)}</b> da empresa
<b>${escape(event.companyName)}</b>: ${event.itemCount} documento(s).</p>
${deadline(event.periodDueDate)}
${linkButton(event.uploadUrl, 'Enviar documentos')}`,
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
  subject: `Lembrete: documentos pendentes de ${asMonth(candidate.referenceMonth)}`,
  body: `<p>Olá, ${escape(candidate.contactName)}.</p>
<p>Ainda faltam ${candidate.pendingItems.length} documento(s) da competência
<b>${asMonth(candidate.referenceMonth)}</b> da empresa <b>${escape(candidate.companyName)}</b>:</p>
<ul>${candidate.pendingItems
    .map(
      (item) =>
        `<li>${escape(item.name)}${(item.dueDate ?? candidate.periodDueDate) ? ` — até ${asDate((item.dueDate ?? candidate.periodDueDate)!)}` : ''}</li>`,
    )
    .join('')}</ul>
${deadline(nextDueDate(candidate))}
${
  candidate.uploadUrl
    ? `${linkButton(candidate.uploadUrl, 'Enviar documentos')}
<p>Este link substitui os anteriores.</p>`
    : '<p>Use o Link de Upload que você já recebeu por email para enviar os arquivos.</p>'
}`,
});

/** Item rejeitado: o link vai rotacionado pela Fase 6, então este email é o único que
 *  funciona a partir de agora — por isso a reabertura é entregue SÓ por email
 *  (invariante do domínio), nunca por WhatsApp. */
export const itemReopenedEmail = (event: ItemReopenedEvent) => ({
  subject: `Reenvio necessário: ${escape(event.itemName)}`,
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>O documento <b>${escape(event.itemName)}</b> da empresa <b>${escape(event.companyName)}</b> precisa ser
enviado novamente.</p>
${event.rejectionReason ? `<p>Motivo: ${escape(event.rejectionReason ?? '')}</p>` : ''}
<p style="color:#64748b;font-size:12px">O link anterior deixou de valer.</p>
${linkButton(event.uploadUrl, 'Enviar documento')}`,
});

/** Revisão em lote: UM email para a conferência inteira. O que foi aceito entra só como
 *  tranquilidade ("não precisa mexer"); o que decide o assunto é a lista de reenvio, e o
 *  link rotacionado é a única forma de reenviar — por isso, email, nunca WhatsApp. */
export const reviewPublishedEmail = (event: ReviewPublishedEvent) => ({
  subject:
    event.rejected.length === 1
      ? `Reenvio necessário: ${escape(event.rejected[0].itemName ?? event.rejected[0].fileName)}`
      : `${event.rejected.length} documentos precisam ser reenviados`,
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>Conferimos os documentos de <b>${escape(event.companyName)}</b>.</p>
<p><b>Precisam ser enviados de novo:</b></p>
<ul>${event.rejected
    .map(
      (row) =>
        `<li><b>${escape(row.itemName ?? row.fileName)}</b> (${escape(row.fileName)}) — ${escape(row.rejectionReason)}</li>`,
    )
    .join('')}</ul>
${
  event.acceptedItemNames.length
    ? `<p>Já estão aceitos, não precisa mexer: ${event.acceptedItemNames
        .map((name) => escape(name))
        .join(', ')}.</p>`
    : ''
}
${
  event.uploadUrl
    ? `<p style="color:#64748b;font-size:12px">O link anterior deixou de valer.</p>
${linkButton(event.uploadUrl, 'Enviar corrigidos')}`
    : '<p>Use o Link de Upload que você já recebeu por email.</p>'
}`,
});

export const requestCompletedEmail = (event: RequestCompletedEvent) => ({
  subject: 'Documentos recebidos',
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>Recebemos e conferimos todos os documentos da empresa <b>${escape(event.companyName)}</b>.
Nada mais é necessário por agora. Obrigado!</p>`,
});

export const deadlineMissedContactEmail = (event: DeadlineMissedEvent) => ({
  subject: `Prazo vencido: ${escape(event.itemName)}`,
  body: `<p>Olá, ${escape(event.contactName)}.</p>
<p>O documento <b>${escape(event.itemName)}</b> venceu em <b>${asDate(event.dueDate)}</b> e ainda não
foi recebido.</p>
${linkButton(event.uploadUrl, 'Enviar agora')}`,
});

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
${linkButton(event.inviteUrl, 'Criar conta')}
<p style="color:#64748b;font-size:12px">O convite expira em ${asDate(event.expiresAt.toISOString().slice(0, 10))}.</p>`,
});

export const magicLinkEmail = ({ url }: { email: string; url: string }) => ({
  subject: 'Seu link de entrada',
  body: `<p>Olá.</p>
<p>Use este link para entrar e enviar seus documentos:</p>
${linkButton(url, 'Entrar')}
<p style="color:#64748b;font-size:12px">Se não foi você que pediu, ignore este email.</p>`,
});

export const recoverConfirmEmail = ({ name, confirmUrl }: { name: string; confirmUrl: string }) => ({
  subject: 'Confirme que é você para receber um novo link de envio',
  body: `<p>Olá${name ? `, ${escape(name)}` : ''}.</p>
<p>Recebemos um pedido de um novo link de envio de documentos para este email.
Confirme para receber o link novo (vale por 30 minutos):</p>
${linkButton(confirmUrl, 'Quero um novo link')}
<p style="color:#64748b;font-size:12px">Se não foi você que pediu, ignore este email — o seu link atual continua valendo.</p>`,
});

export const resetPasswordEmail = ({ url }: { url: string }) => ({
  subject: 'Redefina sua senha',
  body: `<p>Olá.</p>
<p>Recebemos um pedido para redefinir a sua senha. O link vale por 1 hora:</p>
${linkButton(url, 'Redefinir senha')}
<p style="color:#64748b;font-size:12px">Se não foi você que pediu, ignore este email — a sua senha continua a mesma.</p>`,
});
