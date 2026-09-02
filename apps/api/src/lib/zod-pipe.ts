import { PipeTransform } from '@nestjs/common';
import * as z from 'zod';
import { ValidationError } from './app-error.js';

/** Valida @Body/@Query/@Param contra um schema de @contabilidade/contracts.
 *  Chaves desconhecidas são removidas. */
export const zodPipe = (schema: z.ZodType): PipeTransform => ({
  transform(value: unknown) {
    const result = schema.safeParse(value);

    if (!result.success) {
      throw new ValidationError('Dados inválidos.', z.flattenError(result.error));
    }

    return result.data;
  },
});
