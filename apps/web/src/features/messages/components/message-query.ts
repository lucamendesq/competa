import { MessageListQuery } from '@competa/contracts';

export const PER_PAGE = 20;

export const FILTER_PARAMS = {
  companyId: 'empresa',
  channel: 'canal',
  purpose: 'tipo',
  status: 'status',
} as const;
export type FilterField = keyof typeof FILTER_PARAMS;

const parsed = <T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: string | null,
) => {
  if (value === null || value === '') return undefined;
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
};

export const messageQueryOf = (params: URLSearchParams): MessageListQuery => {
  const { shape } = MessageListQuery;
  const query: MessageListQuery = {
    page: parsed(shape.page, params.get('page')) ?? 1,
    perPage: PER_PAGE,
  };
  const companyId = parsed(shape.companyId, params.get(FILTER_PARAMS.companyId));
  const channel = parsed(shape.channel, params.get(FILTER_PARAMS.channel));
  const purpose = parsed(shape.purpose, params.get(FILTER_PARAMS.purpose));
  const status = parsed(shape.status, params.get(FILTER_PARAMS.status));
  return {
    ...query,
    ...(companyId ? { companyId } : {}),
    ...(channel ? { channel } : {}),
    ...(purpose ? { purpose } : {}),
    ...(status ? { status } : {}),
  };
};

export const withFilter = (params: URLSearchParams, field: FilterField, value: string) => {
  const next = new URLSearchParams(params);
  if (value) next.set(FILTER_PARAMS[field], value);
  else next.delete(FILTER_PARAMS[field]);
  next.set('page', '1');
  return next;
};
