import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { getLogger } from '../utils/logger';
import { ATTRS } from '../observabilty/semantic-conventions';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header('X-Request-ID');
  const requestId = incoming && incoming.trim().length > 0 ? incoming : uuidv4();

  req.requestId = requestId;
  req.logger = getLogger({ [ATTRS.REQUEST_ID]: requestId });

  res.setHeader('X-Request-ID', requestId);

  next();
};
