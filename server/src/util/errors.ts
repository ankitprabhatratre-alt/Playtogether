import type { ErrorCode } from '@playtogether/shared';

/** Expected, user-facing error. Message is safe to show to clients. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const forbidden = (msg = 'Only the host can do that.') => new AppError('FORBIDDEN', msg, 403);
export const invalidState = (msg: string) => new AppError('INVALID_STATE', msg, 409);
export const invalidAction = (msg: string) => new AppError('INVALID_ACTION', msg, 400);
