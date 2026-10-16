import { describeAction, formatAgo, formatCount, formatModelName, STATE_LABELS } from "../lib/format";
import type { MapNode } from "../lib/layout";

export function formatNodeTitle(node: MapNode): string {
  return node.type === "idle" ? "Idle subagents" : node.label;
}

/** The tooltip body for a node. */
export function describeNode(node: MapNode): string {
  switch (node.type) {
    case "session": {
      const s = node.session;
      return [STATE_LABELS[s.state], s.project, formatModelName(s.model), formatCount(s.subagents, "subagent")]
        .filter(Boolean)
        .join(" · ");
    }
    case "subagent":
      return [
        [STATE_LABELS[node.sub.state], formatModelName(node.sub.model), formatAgo(node.sub.lastActivity)]
          .filter(Boolean)
          .join(" · "),
        node.sub.task,
        describeAction(node.sub),
      ]
        .filter(Boolean)
        .join("\n");
    case "project":
      return formatCount(node.sessions.length, "open session");
    case "idle":
      return node.open ? "Click to fold the idle subagents" : "Click to show the idle subagents";
  }
}
