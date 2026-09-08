import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map } from 'rxjs';

export const ENVELOPED = Symbol('enveloped');

export type Meta = { page: number; perPage: number; total: number };

export type Enveloped<T> = { data: T[]; meta: Meta; [ENVELOPED]: true };

export const paginated = <T>(data: T[], meta: Meta): Enveloped<T> => ({
  data,
  meta,
  [ENVELOPED]: true,
});

const isEnveloped = (payload: object): payload is Enveloped<unknown> => ENVELOPED in payload;

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((payload: unknown) => {
        if (payload === undefined || payload === null) return payload;
        if (payload instanceof StreamableFile) return payload;

        if (typeof payload === 'object' && isEnveloped(payload)) {
          return { data: payload.data, meta: payload.meta };
        }

        return { data: payload };
      }),
    );
  }
}
