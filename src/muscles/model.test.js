import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GROUP_IDS } from "./taxonomy";

// The figure ships as public/models/body.glb: one mesh per muscle group plus "base".
function glbNodeNames() {
  const b = readFileSync(new URL("../../public/models/body.glb", import.meta.url));
  const jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLength).toString("utf8"));
  return json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name);
}

describe("body model", () => {
  it("has a mesh for every muscle group and the base", () => {
    const names = glbNodeNames();
    for (const g of [...GROUP_IDS, "base"]) expect(names, g).toContain(g);
  });
});
