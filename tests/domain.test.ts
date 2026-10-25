import { test } from "node:test";
import assert from "node:assert/strict";
import { models } from "../src/shared/catalog.ts";
import {
  estimateCost,
  extractVariables,
  renderTemplate,
  categoryDescendants,
  validateTaskInput,
} from "../src/shared/domain.ts";
import type { TaskInput } from "../src/shared/types.ts";
const model = models.find((x) => x.id === "wan3")!;
const input: TaskInput = {
  modelId: "wan3",
  accountId: "a",
  projectId: "default",
  prompt: "深海中的水母，缓慢推进",
  negativePrompt: "",
  mode: "text",
  duration: 10,
  resolution: "720p",
  aspectRatio: "16:9",
  audio: true,
  count: 3,
  referenceAssetIds: [],
};
test("template variables are unique and preserve Chinese names", () => {
  assert.deepEqual(extractVariables("{{产品}} 在 {{ 场景 }} 中展示 {{产品}}"), [
    "产品",
    "场景",
  ]);
});
test("template replacement does not treat dollar syntax as replacement instructions", () => {
  assert.equal(
    renderTemplate("{{产品}} 在 {{场景}}", { 产品: "$&香水", 场景: "水中" }),
    "$&香水 在 水中",
  );
});
test("missing template values are rejected", () => {
  assert.throws(() => renderTemplate("{{产品}}", {}), /产品/);
});
test("video estimate includes every requested generation", () => {
  assert.equal(estimateCost(model, input), 12.6);
});
test("USD price converts with configured budget exchange rate", () => {
  const m = models.find((x) => x.id === "gen45")!;
  assert.equal(estimateCost(m, { ...input, count: 1 }), 8.64);
});
test("Chinese TTS characters use provider billing weight", () => {
  const m = models.find((x) => x.id === "speech-turbo")!;
  assert.equal(
    estimateCost(m, {
      ...input,
      resolution: "MP3",
      prompt: "你好abc",
      count: 1,
    }),
    0.0014,
  );
});
test("descendant filters include nested categories only", () => {
  assert.deepEqual(
    categoryDescendants(
      [
        { id: "a", name: "a", parentId: null, sort: 0 },
        { id: "b", name: "b", parentId: "a", sort: 0 },
        { id: "c", name: "c", parentId: "b", sort: 0 },
        { id: "d", name: "d", parentId: null, sort: 0 },
      ],
      "a",
    ),
    ["a", "b", "c"],
  );
});
test("unsupported resolution is rejected before a paid request", () => {
  assert.throws(
    () => validateTaskInput({ ...input, resolution: "8k" }, model),
    /分辨率/,
  );
});
test("image mode requires a reference asset", () => {
  assert.throws(
    () => validateTaskInput({ ...input, mode: "image" }, model),
    /参考/,
  );
});
test("invalid counts and blank prompts cannot create tasks", () => {
  assert.throws(() => validateTaskInput({ ...input, count: 0 }, model), /数量/);
  assert.throws(
    () => validateTaskInput({ ...input, prompt: "  " }, model),
    /提示词/,
  );
});
