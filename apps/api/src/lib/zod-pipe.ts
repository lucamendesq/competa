import { PipeTransform } from '@nestjs/common';
import * as z from 'zod';
import { ValidationError } from './app-error.js';

if (z.locales?.pt) {
  z.config(z.locales.pt());
}

export const zodPipe = (schema: z.ZodType): PipeTransform => ({
  transform(value: unknown) {
    const result = schema.safeParse(value);

    if (!result.success) {
      throw new ValidationError('Dados inválidos.', z.flattenError(result.error));
    }

    return result.data;
  },
});
