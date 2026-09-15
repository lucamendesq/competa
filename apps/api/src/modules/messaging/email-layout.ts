const NAVY = '#0F172A';
const PRIMARY = '#1E3A8A';
const LINK = '#2563EB';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const SURFACE = '#f8fafc';

export const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `url` escapada e restrita a http(s): hoje todo caller passa URL montada pelo próprio
 *  código, mas um dado controlado que chegue aqui não pode virar atributo executável
 *  (XSS-INFO-1). */
export const linkButton = (url: string, label: string) => {
  const safeUrl = /^https?:\/\//i.test(url) ? escape(url) : '#';

  return `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
  <tr>
    <td style="border-radius:8px;background:${PRIMARY};">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>
<p style="color:${MUTED};font-size:12px;margin:0 0 20px;">
  Se o botão não funcionar, copie e cole este link no navegador:<br />
  <a href="${safeUrl}" style="color:${LINK};word-break:break-all;">${safeUrl}</a>
</p>`;
};

export const emailLayout = (body: string, senderName?: string) => `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:${SURFACE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${NAVY};padding:20px 32px;">
                <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Competa</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:${NAVY};font-size:15px;line-height:1.6;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid ${BORDER};background:${SURFACE};color:${MUTED};font-size:12px;line-height:1.5;">
                ${senderName ? `Enviado por <b>${escape(senderName)}</b> através da Competa.` : 'Competa · coleta de documentos contábeis.'}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
