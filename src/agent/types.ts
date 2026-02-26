export type AgentAction =
  | { type: "fill"; target: string; value: string }
  | { type: "click"; target: string }
  | { type: "select"; target: string; value: string }
  | { type: "expand"; target: string }
  | { type: "done"; reason?: string };

export type AgentPlan = {
  actions: AgentAction[];
  done?: boolean;
  reason?: string;
};

export function assertPlan(x: any): AgentPlan {
  if (!x || typeof x !== "object") throw new Error("Plan is not an object");
  if (!Array.isArray(x.actions))
    throw new Error("Plan.actions must be an array");

  for (const a of x.actions) {
    if (!a || typeof a !== "object")
      throw new Error("Action must be an object");
    if (typeof a.type !== "string")
      throw new Error("Action.type must be string");

    if (a.type === "fill") {
      if (typeof a.target !== "string" || !a.target.trim())
        throw new Error("fill.target invalid");
      if (typeof a.value !== "string") throw new Error("fill.value invalid");
    } else if (a.type === "click") {
      if (typeof a.target !== "string" || !a.target.trim())
        throw new Error("click.target invalid");
    } else if (a.type === "select") {
      if (typeof a.target !== "string" || !a.target.trim())
        throw new Error("select.target invalid");
      if (typeof a.value !== "string") throw new Error("select.value invalid");
    } else if (a.type === "expand") {
      if (typeof a.target !== "string" || !a.target.trim())
        throw new Error("expand.target invalid");
    } else if (a.type === "done") {
      // ok
    } else {
      throw new Error(`Unknown action type: ${a.type}`);
    }
  }

  return x as AgentPlan;
}
