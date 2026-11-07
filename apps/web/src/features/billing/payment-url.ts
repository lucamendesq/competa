const parsedUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

/** O link de pagamento vem da nossa API, mas quem o escreve é o Asaas. Só se navega para
 *  `https:` no domínio dele: um valor adulterado no caminho não vira redirecionamento. */
export const isAsaasPaymentUrl = (value: string): boolean => {
  const url = parsedUrl(value);
  if (!url) return false;

  return (
    url.protocol === 'https:' &&
    (url.hostname === 'asaas.com' || url.hostname.endsWith('.asaas.com'))
  );
};
