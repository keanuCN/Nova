import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Studio } from "../src/server/studio";
import {
  submitTask,
  pollTask,
  ProviderError,
  refreshBalance,
} from "../src/server/providers";
import { runWorkerTick } from "../src/server/worker";
import { handleApi } from "../src/server/api";
import { models } from "../src/shared/catalog";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "studio-provider-"));
  const s = new Studio(dir);
  return {
    s,
    close() {
      s.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
function queued(s: Studio, modelId = "h3") {
  const m = models.find((x) => x.id === modelId)!;
  const a = s.saveAccount({
    name: "offline",
    providerId: m.providerId,
    key: "never-real-key",
    secret: m.providerId === "aliyun" ? "workspace-test" : undefined,
    budget: 1000,
    enabled: true,
  });
  return s.createTasks({
    modelId: m.id,
    accountId: a.id,
    projectId: s.state().projects[0].id,
    prompt: "forest",
    negativePrompt: "",
    mode: "text",
    duration: m.durations[0],
    resolution: m.resolutions[0],
    aspectRatio: m.aspects[0],
    audio: m.audio,
    count: 1,
    referenceAssetIds: [],
  })[0];
}
test("H3 uses the verified V2 endpoint and content schema", async () => {
  const f = fixture();
  try {
    const t = queued(f.s);
    let calls = 0;
    const result = await submitTask(f.s, t, async (url, init) => {
      calls++;
      assert.equal(url, "https://api.minimax.cn/v2/video_generation");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, "MiniMax-H3");
      assert.deepEqual(body.content, [{ type: "text", text: "forest" }]);
      return Response.json({ task_id: "remote-1" });
    });
    assert.equal(calls, 1);
    assert.equal(result.remoteId, "remote-1");
  } finally {
    f.close();
  }
});
test("POST timeout becomes unknown and repeated worker ticks never submit again", async () => {
  const f = fixture();
  try {
    const t = queued(f.s);
    let calls = 0;
    const offline = async () => {
      calls++;
      throw new DOMException("Timeout", "TimeoutError");
    };
    await runWorkerTick(f.s, offline);
    assert.equal(f.s.get<any>("tasks", t.id).status, "unknown");
    await runWorkerTick(f.s, offline);
    assert.equal(calls, 1);
  } finally {
    f.close();
  }
});
test("processing refresh uses only GET with the persisted remote identifier", async () => {
  const f = fixture();
  try {
    const t = queued(f.s, "gen45");
    f.s.updateTask(t.id, { status: "processing", remoteId: "remote-one" });
    const updated = f.s.get<any>("tasks", t.id);
    const r = await pollTask(f.s, updated, async (url, init) => {
      assert.equal(init?.method, "GET");
      assert.equal(url, "https://api.dev.runwayml.com/v1/tasks/remote-one");
      return Response.json({ status: "RUNNING" });
    });
    assert.equal(r.status, "processing");
  } finally {
    f.close();
  }
});
test("provider errors do not expose upstream text or authorization secrets", async () => {
  const f = fixture();
  try {
    const t = queued(f.s);
    await assert.rejects(
      () =>
        submitTask(
          f.s,
          t,
          async () => new Response("never-real-key", { status: 401 }),
        ),
      (e) =>
        e instanceof ProviderError && !e.message.includes("never-real-key"),
    );
  } finally {
    f.close();
  }
});
test("mutation origin and authentication are required before APIs can change state", async () => {
  const f = fixture();
  try {
    const token = f.s.setup("a-long-test-password");
    const cookie = `studio_session=${token}`;
    const cross = await handleApi(
      new Request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: {
          cookie,
          origin: "http://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "blocked" }),
      }),
      f.s,
    );
    assert.equal(cross.status, 403);
    const noSession = await handleApi(
      new Request("http://localhost:3000/api/state"),
      f.s,
    );
    assert.equal(noSession.status, 401);
    const valid = await handleApi(
      new Request("http://localhost:3000/api/state", { headers: { cookie } }),
      f.s,
    );
    assert.equal(valid.status, 200);
  } finally {
    f.close();
  }
});

test("a received paid audio response whose local save fails keeps pending cost and never resubmits", async () => {
  const f = fixture();
  try {
    const t = queued(f.s, "speech-turbo");
    let calls = 0;
    const offline = async () => {
      calls++;
      return Response.json({
        data: { audio: "00" },
        base_resp: { status_code: 0 },
      });
    };
    await runWorkerTick(f.s, offline);
    const after = f.s.get<any>("tasks", t.id);
    assert.equal(after.status, "unknown");
    assert.equal(after.costStatus, "pending");
    await runWorkerTick(f.s, offline);
    assert.equal(calls, 1);
  } finally {
    f.close();
  }
});
test("a successful vendor HTTP response that reports an internal business error remains uncertain", async () => {
  const f = fixture();
  try {
    const t = queued(f.s, "speech-turbo");
    await runWorkerTick(f.s, async () =>
      Response.json({
        base_resp: { status_code: 1000, status_msg: "upstream internal fault" },
      }),
    );
    assert.equal(f.s.get<any>("tasks", t.id).status, "unknown");
  } finally {
    f.close();
  }
});
test("credentials are never sent to redirected provider endpoints", async () => {
  const f = fixture();
  try {
    const t = queued(f.s);
    await assert.rejects(
      () =>
        submitTask(f.s, t, async (_url, init) => {
          assert.equal(init?.redirect, "error");
          throw new TypeError("redirect blocked");
        }),
      (e) => e instanceof ProviderError && e.uncertain,
    );
  } finally {
    f.close();
  }
});

test("China account keys stay on the official China MiniMax endpoint", async () => {
  const f = fixture();
  try {
    const t = queued(f.s);
    await submitTask(f.s, t, async (url) => {
      assert.equal(url, "https://api.minimax.cn/v2/video_generation");
      return Response.json({ task_id: "cn-only" });
    });
  } finally {
    f.close();
  }
});
test("Aliyun Beijing pricing only submits to the Beijing workspace endpoint", async () => {
  const f = fixture();
  try {
    const t = queued(f.s, "wan3");
    await submitTask(f.s, t, async (url, init) => {
      assert.equal(
        url,
        "https://workspace-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      );
      assert.equal(JSON.parse(init!.body as string).model, "wan3.0-video");
      return Response.json({ output: { task_id: "beijing-only" } });
    });
  } finally {
    f.close();
  }
});
test("Aliyun unsupported pricing regions are rejected before queueing", () => {
  const f = fixture();
  try {
    const t = queued(f.s, "wan3");
    f.s.cancelQueued(t.id);
    f.s.saveAccount({ region: "新加坡" }, t.accountId);
    assert.throws(() => f.s.createTasks(t.input), /北京/);
  } finally {
    f.close();
  }
});
test("H3 rejects the unsupported silent output toggle", () => {
  const f = fixture();
  try {
    const t = queued(f.s);
    assert.throws(() => f.s.createTasks({ ...t.input, audio: false }), /音轨/);
  } finally {
    f.close();
  }
});

test("invalid catalog choices are user input errors without internal exception details", async () => {
  const f = fixture();
  try {
    const token = f.s.setup("a-long-test-password");
    const r = await handleApi(
      new Request("http://localhost:3000/api/tasks", {
        method: "POST",
        headers: {
          cookie: `studio_session=${token}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ modelId: "missing-model" }),
      }),
      f.s,
    );
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /模型/);
  } finally {
    f.close();
  }
});

test("authenticated multipart uploads persist privately and reject spoofed MIME", async () => {
  const f = fixture();
  try {
    const session = f.s.setup("a-long-test-password");
    const headers = {
      cookie: `studio_session=${session}`,
      origin: "http://localhost:3000",
    };
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cXyQAAAAASUVORK5CYII=",
      "base64",
    );
    const form = new FormData();
    form.set("projectId", f.s.state().projects[0].id);
    form.set("file", new File([bytes], "tiny.png", { type: "image/png" }));
    const upload = await handleApi(
      new Request("http://localhost:3000/api/assets", {
        method: "POST",
        headers,
        body: form,
      }),
      f.s,
    );
    assert.equal(upload.status, 201);
    const asset = await upload.json();
    assert.match(asset.url, /^\/api\/assets\//);
    assert.equal(
      (await handleApi(new Request(`http://localhost:3000${asset.url}`), f.s))
        .status,
      401,
    );
    const get = await handleApi(
      new Request(`http://localhost:3000${asset.url}`, { headers }),
      f.s,
    );
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), bytes);
    const bad = new FormData();
    bad.set("projectId", f.s.state().projects[0].id);
    bad.set(
      "file",
      new File(["<script>bad()</script>"], "fake.png", { type: "image/png" }),
    );
    const denied = await handleApi(
      new Request("http://localhost:3000/api/assets", {
        method: "POST",
        headers,
        body: bad,
      }),
      f.s,
    );
    assert.equal(denied.status, 400);
  } finally {
    f.close();
  }
});
test("first-frame data URIs use the verified Wan media schema with no localhost URL", async () => {
  const f = fixture();
  try {
    const old = queued(f.s, "wan3");
    f.s.cancelQueued(old.id);
    const image = f.s.saveAsset(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
      "first.png",
      old.projectId,
    );
    const [t] = f.s.createTasks({
      ...old.input,
      mode: "image",
      referenceAssetIds: [image.id],
    });
    await submitTask(f.s, t, async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.equal(body.input.media[0].type, "first_frame");
      assert.match(body.input.media[0].url, /^data:image\/png;base64,/);
      assert.equal(JSON.stringify(body).includes("localhost"), false);
      return Response.json({ output: { task_id: "wan-image" } });
    });
  } finally {
    f.close();
  }
});

test("Vidu balance uses Token auth and preserves resource types without mixing credit units", async () => {
  const f = fixture();
  try {
    const a = f.s.saveAccount({
      providerId: "vidu",
      name: "vidu-key",
      key: "offline-only",
      region: "中国大陆",
      budget: 100,
    });
    let called = false;
    const result = await refreshBalance(f.s, a.id, async (url, init) => {
      called = true;
      assert.equal(url, "https://api.vidu.cn/ent/v2/credits");
      assert.equal(
        (init!.headers as Record<string, string>).Authorization,
        "Token offline-only",
      );
      return Response.json({
        remains: [
          { type: "metered", credit_remain: 120 },
          { type: "test", credit_remain: 20 },
          { type: "concurrent", credit_remain: 500 },
        ],
      });
    });
    assert.equal(called, true);
    assert.equal(result.balance.amount, 120);
    assert.equal(result.balance.kind, "计量资源包积分");
    assert.match(result.balance.note, /测试积分 20/);
    assert.match(result.balance.note, /并发包积分 500/);
    assert.equal(JSON.stringify(result).includes("offline-only"), false);
  } finally {
    f.close();
  }
});

test("MiniMax international generation rejects the incompatible China price snapshot", () => {
  const f = fixture();
  try {
    const t = queued(f.s);
    f.s.cancelQueued(t.id);
    f.s.saveAccount({ region: "国际" }, t.accountId);
    assert.throws(() => f.s.createTasks(t.input), /中国大陆.*价格/);
  } finally {
    f.close();
  }
});
test("Runway checks encoded URI size before reserving a first-frame task", () => {
  const f = fixture();
  try {
    const old = queued(f.s, "gen45");
    f.s.cancelQueued(old.id);
    const bytes = Buffer.alloc(4 * 1024 * 1024);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    const image = f.s.saveAsset(bytes, "image/png", "large.png", old.projectId);
    assert.throws(
      () =>
        f.s.createTasks({
          ...old.input,
          mode: "image",
          referenceAssetIds: [image.id],
        }),
      /3.7MB/,
    );
  } finally {
    f.close();
  }
});

test("Next normalized localhost URLs still accept matching loopback Host and Origin", async () => {
  const f = fixture();
  try {
    const r = await handleApi(
      new Request("http://localhost:3000/api/auth/setup", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: "short" }),
      }),
      f.s,
    );
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /密码/);
    const rebound = await handleApi(
      new Request("http://localhost:3000/api/auth/setup", {
        method: "POST",
        headers: {
          host: "attacker.example:3000",
          origin: "http://attacker.example:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: "long-test-password" }),
      }),
      f.s,
    );
    assert.equal(rebound.status, 403);
    assert.equal(f.s.setupRequired(), true);
  } finally {
    f.close();
  }
});

test("exact budget reservations compare integer micro-yuan instead of floating-point sums", () => {
  const f = fixture();
  try {
    const t = queued(f.s, "speech-turbo");
    f.s.cancelQueued(t.id);
    f.s.updateSettings({ dailyBudget: 0.0006, monthlyBudget: 0.0006 });
    assert.equal(
      f.s.createTasks({ ...t.input, prompt: "a", count: 3 }).length,
      3,
    );
    assert.throws(() => f.s.createTasks({ ...t.input, prompt: "a" }), /预算/);
  } finally {
    f.close();
  }
});

for (const scenario of ["oversized", "empty"] as const) {
  test(`ElevenLabs accepted ${scenario} audio keeps its reservation and never resubmits`, async () => {
    const f = fixture();
    try {
      const task = queued(f.s, "eleven-v4");
      f.s.updateSettings({
        dailyBudget: task.estimatedCost,
        monthlyBudget: task.estimatedCost,
      });
      let calls = 0;
      const offline = async () => {
        calls++;
        return scenario === "oversized"
          ? new Response("body", {
              status: 200,
              headers: { "content-length": String(51 * 1024 * 1024) },
            })
          : new Response(null, { status: 200 });
      };
      await runWorkerTick(f.s, offline);
      const after = f.s.get<any>("tasks", task.id);
      assert.equal(after.status, "unknown");
      assert.equal(after.costStatus, "pending");
      assert.throws(() => f.s.createTasks(task.input), /预算/);
      await runWorkerTick(f.s, offline);
      assert.equal(calls, 1);
    } finally {
      f.close();
    }
  });
}
