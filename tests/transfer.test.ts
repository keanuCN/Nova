import { test } from "node:test";
import assert from "node:assert/strict";
import { saveDraft, takeDraft } from "../src/shared/transfer";
import { initialPrompts } from "../src/shared/seed";
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
};
test("applied template survives page remount and is consumed once", () => {
  const s = storage();
  saveDraft(s, { text: "蓝色水母测试镜头", template: initialPrompts[0] });
  assert.equal(takeDraft(s, "video")?.text, "蓝色水母测试镜头");
  assert.equal(takeDraft(s, "video"), null);
});
test("audio template is not consumed by video page", () => {
  const s = storage();
  saveDraft(s, {
    text: "旁白",
    template: initialPrompts.find((p) => p.modelId === "speech-turbo")!,
  });
  assert.equal(takeDraft(s, "video"), null);
  assert.equal(takeDraft(s, "audio")?.text, "旁白");
});
test("corrupt transfer payload does not crash the studio", () => {
  const s = storage();
  s.setItem("yingzao-template-draft", "{");
  assert.equal(takeDraft(s, "video"), null);
});
