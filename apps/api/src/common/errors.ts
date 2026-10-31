import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { NoteValidationError, TransitionError } from '@sqt/domain';

/** Lỗi nghiệp vụ có mã ổn định để app hiển thị đúng thông báo. */
export class BusinessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = HttpStatus.UNPROCESSABLE_ENTITY,
  ) {
    super(message);
  }
}

/** Mọi lỗi trả về dạng { error: { code, message } } — Phần 6.4. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const [status, code, message] = this.describe(exception);
    if (status >= 500) this.logger.error(exception);
    res.status(status).json({ error: { code, message } });
  }

  private describe(e: unknown): [number, string, string] {
    if (e instanceof BusinessError) return [e.status, e.code, e.message];
    if (e instanceof TransitionError) return [HttpStatus.CONFLICT, e.reason ?? e.code, e.message];
    if (e instanceof NoteValidationError) return [HttpStatus.UNPROCESSABLE_ENTITY, e.code, e.message];
    if (e instanceof HttpException) {
      const body = e.getResponse() as string | { message?: string | string[] };
      const message = typeof body === 'string' ? body : Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? e.message);
      return [e.getStatus(), HttpStatus[e.getStatus()] ?? 'ERROR', message];
    }
    return [HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại'];
  }
}
