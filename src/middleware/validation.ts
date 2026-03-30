import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

import { ValidationError } from '../errors';

export const validateBody = (schema: ZodTypeAny) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');

      throw new ValidationError(message);
    }

    req.body = parsed.data;
    next();
  };
};
