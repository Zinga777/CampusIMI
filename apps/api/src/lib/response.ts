import type { Context } from "hono";

export function ok<T>(c: Context, data: T, status = 200) {
  return c.json({ success: true, data }, status as 200);
}

export class ApiException extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function fail(c: Context, code: string, message: string, status = 400) {
  return c.json({ success: false, error: { code, message } }, status as 400);
}
