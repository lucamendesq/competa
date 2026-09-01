import { BadRequestException, PipeTransform } from '@nestjs/common';
import * as z from 'zod';

/** Validates a @Body/@Query/@Param against a Zod schema.
 *  Unknown keys are stripped, so it also covers class-transformer's job. */
export const zodPipe = (schema: z.ZodType): PipeTransform => ({
  transform(value: unknown) {
    const result = schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException(z.flattenError(result.error));
    }

    return result.data;
  },
});
