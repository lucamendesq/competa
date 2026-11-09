import { describe, expect, it } from 'vitest';
import { pageItems } from '@/shared/components/ui/pagination';

const labels = (page: number, pageCount: number) =>
  pageItems(page, pageCount).map((item) => (item.type === 'page' ? item.value : '…'));

describe('pageItems', () => {
  it('lista todas as páginas quando cabem', () => {
    expect(labels(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('usa reticências à direita perto do começo', () => {
    expect(labels(2, 20)).toEqual([1, 2, 3, 4, 5, '…', 20]);
  });

  it('usa reticências nos dois lados no meio', () => {
    expect(labels(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
  });

  it('usa reticências à esquerda perto do fim', () => {
    expect(labels(19, 20)).toEqual([1, '…', 16, 17, 18, 19, 20]);
  });
});
