import { describe, expect, it } from "vitest";
import { getNpcDialogueNode, validateNpcDialogueGraph } from "./dialogueGraph.js";

const graph = {
  startNodeId: "hello",
  nodes: [
    { id: "hello", text: "Xin chào", choices: [{ id: "tour", label: "Tham quan", nextNodeId: "end", unlockQuestIds: ["first_greeting"], setFlag: "tourAsked" }] },
    { id: "end", text: "Chúc an lành", choices: [] },
  ],
};

describe("NPC branching dialogue graph", () => {
  it("validates graph references and resolves a node", () => {
    const parsed = validateNpcDialogueGraph(graph);
    expect(getNpcDialogueNode(parsed, "hello")?.choices[0]?.nextNodeId).toBe("end");
  });
  it("rejects unknown next nodes and duplicate node IDs", () => {
    expect(() => validateNpcDialogueGraph({ ...graph, nodes: [{ ...graph.nodes[0]!, choices: [{ ...graph.nodes[0]!.choices[0]!, nextNodeId: "missing" }] }] })).toThrow();
    expect(() => validateNpcDialogueGraph({ ...graph, nodes: [graph.nodes[0]!, graph.nodes[0]!] })).toThrow();
  });
});
