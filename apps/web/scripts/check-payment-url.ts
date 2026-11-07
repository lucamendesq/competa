import assert from 'node:assert/strict';
import { isAsaasPaymentUrl } from '../src/features/billing/payment-url.js';

assert.equal(isAsaasPaymentUrl('https://www.asaas.com/i/abc123'), true);
assert.equal(isAsaasPaymentUrl('https://sandbox.asaas.com/c/xyz'), true);
assert.equal(isAsaasPaymentUrl('https://asaas.com/i/abc123'), true);
assert.equal(isAsaasPaymentUrl('https://WWW.ASAAS.COM/i/abc123'), true);

assert.equal(isAsaasPaymentUrl('http://www.asaas.com/i/abc123'), false, 'só https');
assert.equal(isAsaasPaymentUrl('https://evilasaas.com/i/abc'), false, 'sufixo sem o ponto');
assert.equal(isAsaasPaymentUrl('https://asaas.com.evil.io/i/abc'), false, 'asaas como prefixo');
assert.equal(isAsaasPaymentUrl('https://www.asaas.com@evil.io/i/abc'), false, 'credencial na URL');
assert.equal(isAsaasPaymentUrl('javascript:alert(1)'), false);
assert.equal(isAsaasPaymentUrl('/billing/invoice'), false, 'relativa não é do Asaas');
assert.equal(isAsaasPaymentUrl(''), false);

console.log('check-payment-url: ok');
