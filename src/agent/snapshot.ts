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
  toggles: Array<{ text: string; selectorHint: string; expanded?: boolean }>;
};

export async function snapshotPage(page: Page): Promise<PageSnapshot> {
  return await page.evaluate(() => {
    const cleanText = (s: string) => s.replace(/\s+/g, " ").trim();

    const getLabelText = (el: Element): string => {
      const id = (el as HTMLElement).id;
      if (id) {
        const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (byFor?.textContent) return cleanText(byFor.textContent);
      }

      const wrap = el.closest("label");
      if (wrap?.textContent) return cleanText(wrap.textContent);

      const aria = (el as HTMLElement).getAttribute("aria-label");
      if (aria) return cleanText(aria);

      const ph = (el as HTMLInputElement).placeholder;
      if (ph) return cleanText(ph);

      return "";
    };

    const selectorHint = (el: Element): string => {
      const id = (el as HTMLElement).id;
      if (id) return `#${id}`;

      const testId = (el as HTMLElement).getAttribute("data-testid");
      if (testId) return `[data-testid="${testId}"]`;

      const name = (el as HTMLInputElement).name;
      if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;

      const ariaLabel = (el as HTMLElement).getAttribute("aria-label");
      if (ariaLabel) {
        return `${el.tagName.toLowerCase()}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
      }

      const txt = cleanText((el as HTMLElement).textContent || "");
      if (txt) {
        const tag = el.tagName.toLowerCase();
        return `${tag}:has-text("${txt.replace(/"/g, '\\"')}")`;
      }

      return el.tagName.toLowerCase();
    };

    const inputs = Array.from(document.querySelectorAll("input, textarea"))
      .filter((el) => !(el as HTMLInputElement).disabled)
      .slice(0, 60)
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
      .slice(0, 30)
      .map((el) => ({
        text: cleanText(
          (el as HTMLElement).textContent ||
            (el as HTMLInputElement).value ||
            "",
        ),
        selectorHint: selectorHint(el),
      }))
      .filter((b) => b.text);

    const selects = Array.from(document.querySelectorAll("select"))
      .filter((el) => !(el as HTMLSelectElement).disabled)
      .slice(0, 30)
      .map((el) => ({
        label: getLabelText(el),
        selectorHint: selectorHint(el),
        options: Array.from((el as HTMLSelectElement).options)
          .slice(0, 50)
          .map((o) => cleanText(o.text || o.value)),
      }));

    const toggleCandidates = Array.from(
      document.querySelectorAll("[aria-expanded], [role='button'], button"),
    )
      .filter((el) => !(el as HTMLElement).hasAttribute("disabled"))
      .map((el) => {
        const txt = cleanText((el as HTMLElement).textContent || "");
        if (!txt) return null;

        const ariaExpanded = (el as HTMLElement).getAttribute("aria-expanded");
        const expanded =
          ariaExpanded === "true"
            ? true
            : ariaExpanded === "false"
              ? false
              : undefined;

        return {
          text: txt,
          selectorHint: selectorHint(el),
          expanded,
        };
      })
      .filter(Boolean) as Array<{
      text: string;
      selectorHint: string;
      expanded?: boolean;
    }>;

    const seen = new Set<string>();
    const toggles = toggleCandidates.filter((t) => {
      const key = t.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      url: location.href,
      title: document.title,
      inputs,
      buttons,
      selects,
      toggles,
    };
  });
}
