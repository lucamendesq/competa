import { uuid } from '@/testing/factories/ids';

type TemplateSummary = {
  id: string;
  name: string;
  derivedFrom: string | null;
  isProduct: boolean;
  itemCount: number;
  companyCount: number;
};

export const template = (overrides: Partial<TemplateSummary> = {}): TemplateSummary => ({
  id: uuid(),
  name: 'Template Simples Nacional',
  derivedFrom: null,
  isProduct: true,
  itemCount: 16,
  companyCount: 0,
  ...overrides,
});
