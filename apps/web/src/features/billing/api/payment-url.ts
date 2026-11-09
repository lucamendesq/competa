const parsedUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const isAsaasPaymentUrl = (value: string) => {
  const url = parsedUrl(value);
  if (!url) return false;
  return (
    url.protocol === 'https:' &&
    (url.hostname === 'asaas.com' || url.hostname.endsWith('.asaas.com'))
  );
};

export const PAYMENT_LINK_REFUSED =
  'O link de pagamento recebido não é do Asaas e não foi aberto. Fale com o suporte.';
