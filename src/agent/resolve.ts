import { PageSnapshot } from "./snapshot";

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function resolveInputSelector(
  snapshot: PageSnapshot,
  target: string,
): string | null {
  const t = norm(target);
  const exact = snapshot.inputs.find((i) => norm(i.label) === t);
  if (exact) return exact.selectorHint;

  const contains = snapshot.inputs.find(
    (i) => norm(i.label).includes(t) || t.includes(norm(i.label)),
  );
  return contains?.selectorHint ?? null;
}

export function resolveButtonSelector(
  snapshot: PageSnapshot,
  target: string,
): string | null {
  const t = norm(target);
  const exact = snapshot.buttons.find((b) => norm(b.text) === t);
  if (exact) return exact.selectorHint;

  const contains = snapshot.buttons.find(
    (b) => norm(b.text).includes(t) || t.includes(norm(b.text)),
  );
  return contains?.selectorHint ?? null;
}

export function resolveSelectSelector(
  snapshot: PageSnapshot,
  target: string,
): string | null {
  const t = norm(target);
  const exact = snapshot.selects.find((s) => norm(s.label) === t);
  if (exact) return exact.selectorHint;

  const contains = snapshot.selects.find(
    (s) => norm(s.label).includes(t) || t.includes(norm(s.label)),
  );
  return contains?.selectorHint ?? null;
}
