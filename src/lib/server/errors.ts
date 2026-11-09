/** An error that is safe to show to the user, with the HTTP status to use. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly headers: Record<string, string>;

  constructor(code: string, message: string, status: number, headers: Record<string, string> = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.headers = headers;
  }
}
