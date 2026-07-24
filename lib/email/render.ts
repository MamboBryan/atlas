import { render } from "@react-email/render";
import type { ReactElement } from "react";

export async function renderEmail(el: ReactElement) {
  const [html, text] = await Promise.all([
    render(el),
    render(el, { plainText: true }),
  ]);
  return { html, text };
}
