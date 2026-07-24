export type ActionOk<T> = { ok: true; data: T };
export type ActionErr = { ok: false; error: { code: string; message: string } };
export type ActionResult<T> = ActionOk<T> | ActionErr;

export const ok = <T>(data: T): ActionOk<T> => ({ ok: true, data });
export const err = (code: string, message: string): ActionErr => ({
  ok: false,
  error: { code, message },
});
