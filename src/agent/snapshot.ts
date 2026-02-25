import { Page } from "playwright";

export type PageSnapshot = {
  url: string;
  title: string;
  inputs: Array<{
    label: string;
    selectorHint: string;
    type: string;
    value?: string;
  }>;
  buttons: Array<{ text: string; selectorHint: string }>;
  selects: Array<{ label: string; selectorHint: string; options: string[] }>;
};

function trim(s: string, max = 80) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export async function snapshotPage(page: Page): Promise<PageSnapshot> {
  return await page.evaluate(() => {
    const getLabelText = (el: Element): string => {
      const id = (el as HTMLElement).id;
      if (id) {
        const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (byFor?.textContent) return byFor.textContent;
      }

      const wrap = el.closest("label");
      if (wrap?.textContent) return wrap.textContent;

      const aria = (el as HTMLElement).getAttribute("aria-label");
      if (aria) return aria;

      const ph = (el as HTMLInputElement).placeholder;
      if (ph) return ph;

      return "";
    };

    const selectorHint = (el: Element): string => {
      const id = (el as HTMLElement).id;
      if (id) return `#${id}`;

      const testId = (el as HTMLElement).getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;

      const name = (el as HTMLInputElement).name;
      if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;

      if (el.tagName.toLowerCase() === "button") {
        const txt = (el as HTMLElement).textContent
          ?.replace(/\s+/g, " ")
          .trim();
        if (txt) return `button:has-text("${txt.replace(/"/g, '\\"')}")`;
      }

      return el.tagName.toLowerCase();
    };

    const inputs = Array.from(document.querySelectorAll("input, textarea"))
      .filter((el) => !(el as HTMLInputElement).disabled)
      .slice(0, 40)
      .map((el) => {
        const type = (el as HTMLInputElement).type || el.tagName.toLowerCase();
        const value =
          (el as HTMLInputElement).value ??
          (el as HTMLTextAreaElement).value ??
          undefined;
        return {
          label: getLabelText(el),
          selectorHint: selectorHint(el),
          type,
          value,
        };
      });

    const buttons = Array.from(
      document.querySelectorAll("button, input[type='submit']"),
    )
      .filter((el) => !(el as HTMLButtonElement).disabled)
      .slice(0, 20)
      .map((el) => ({
        text:
          (el as HTMLElement).textContent ||
          (el as HTMLInputElement).value ||
          "",
        selectorHint: selectorHint(el),
      }));

    const selects = Array.from(document.querySelectorAll("select"))
      .filter((el) => !(el as HTMLSelectElement).disabled)
      .slice(0, 20)
      .map((el) => ({
        label: getLabelText(el),
        selectorHint: selectorHint(el),
        options: Array.from((el as HTMLSelectElement).options)
          .slice(0, 30)
          .map((o) => o.text || o.value),
      }));

    return {
      url: location.href,
      title: document.title,
      inputs,
      buttons,
      selects,
    };
  });
}
