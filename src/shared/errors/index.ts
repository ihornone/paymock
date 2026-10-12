import type { ErrorResponse } from '../../types/acquiring';

export class AcquiringError extends Error {
  public readonly statusCode: number;
  public readonly errCode: string;
  public readonly errText: string;

  constructor(statusCode: number, errCode: string, errText: string) {
    super(errText);
    this.name = 'AcquiringError';
    this.statusCode = statusCode;
    this.errCode = errCode;
    this.errText = errText;
  }

  toResponse(): ErrorResponse {
    return {
      errCode: this.errCode,
      errText: this.errText,
    };
  }
}

export class BadRequestError extends AcquiringError {
  constructor(errText: string = 'invalid request parameters', errCode: string = 'BAD_REQUEST') {
    super(400, errCode, errText);
  }
}

export class InvalidMerchantPaymInfoError extends AcquiringError {
  constructor(errText: string = "invalid 'merchantPaymInfo' object") {
    super(400, 'INVALID_MERCHANT_PAYM_INFO', errText);
  }
}

export class ForbiddenError extends AcquiringError {
  constructor(errText: string = 'invalid X-Token') {
    super(403, 'FORBIDDEN', errText);
  }
}

export class NotFoundError extends AcquiringError {
  constructor(errText: string = 'resource not found', errCode: string = 'NOT_FOUND') {
    super(404, errCode, errText);
  }
}

export class MethodNotAllowedError extends AcquiringError {
  constructor(errText: string = 'method not allowed') {
    super(405, 'METHOD_NOT_ALLOWED', errText);
  }
}

export class TooManyRequestsError extends AcquiringError {
  constructor(errText: string = 'too many requests, try again later') {
    super(429, 'TMR', errText);
  }
}

export class InternalError extends AcquiringError {
  constructor(errText: string = 'internal server error', errCode: string = 'INTERNAL_ERROR') {
    super(500, errCode, errText);
  }
}

export class CancelNotAvailableError extends AcquiringError {
  constructor(errText: string = 'payment cannot be cancelled') {
    super(500, 'CANCEL_NOT_AVAILABLE', errText);
  }
}

export class WrongCancelAmountError extends AcquiringError {
  constructor(errText: string = 'wrong cancel amount') {
    super(400, 'WRONG_CANCEL_AMOUNT', errText);
  }
}
