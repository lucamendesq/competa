import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '@/testing/mocks/server';

// Mesmo motivo do `testTimeout`: o primeiro `findBy` espera a tela lazy carregar.
configure({ asyncUtilTimeout: 10_000 });

const readBlob = <T extends string | ArrayBuffer>(blob: Blob, as: 'text' | 'buffer') =>
  new Promise<T>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error);
    if (as === 'text') reader.readAsText(blob);
    else reader.readAsArrayBuffer(blob);
  });

// O Blob do jsdom não tem text()/arrayBuffer(); o do navegador tem.
Blob.prototype.text ??= function text(this: Blob) {
  return readBlob<string>(this, 'text');
};
Blob.prototype.arrayBuffer ??= function arrayBuffer(this: Blob) {
  return readBlob<ArrayBuffer>(this, 'buffer');
};

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
