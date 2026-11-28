import { z } from "zod";

const id = z.string().regex(/^[a-z0-9_-]{1,64}$/i);
const choiceSchema = z.object({
  id,
  label: z.string().trim().min(1).max(160),
  nextNodeId: id,
  unlockQuestIds: z.array(id).max(16).optional(),
  setFlag: id.optional(),
});
const nodeSchema = z.object({
  id,
  text: z.string().trim().min(1).max(1200),
  choices: z.array(choiceSchema).max(12),
});
const graphSchema = z.object({ startNodeId: id, nodes: z.array(nodeSchema).min(1).max(64) }).superRefine((graph, ctx) => {
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate dialogue node id", path: ["nodes"] });
    nodeIds.add(node.id);
    const choiceIds = new Set<string>();
    for (const choice of node.choices) {
      if (choiceIds.has(choice.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate choice id", path: ["nodes"] });
      choiceIds.add(choice.id);
    }
  }
  if (!nodeIds.has(graph.startNodeId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Start node does not exist", path: ["startNodeId"] });
  graph.nodes.forEach((node, nodeIndex) => node.choices.forEach((choice, choiceIndex) => {
    if (!nodeIds.has(choice.nextNodeId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choice points to an unknown node", path: ["nodes", nodeIndex, "choices", choiceIndex, "nextNodeId"] });
  }));
});

export type NpcDialogueGraph = z.infer<typeof graphSchema>;
export type NpcDialogueNode = NpcDialogueGraph["nodes"][number];
export type NpcDialogueChoice = NpcDialogueNode["choices"][number];

export function validateNpcDialogueGraph(value: unknown): NpcDialogueGraph {
  return graphSchema.parse(value);
}

export function getNpcDialogueNode(graph: NpcDialogueGraph, nodeId: string): NpcDialogueNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}
