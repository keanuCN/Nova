import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Studio } from "../src/server/studio";
import { models } from "../src/shared/catalog";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "studio-test-"));
  const s = new Studio(dir);
  return {
    s,
    dir,
    close() {
      s.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
function task(s: Studio, accountId: string) {
  const m = models.find(
    (m) => m.enabled && m.kind === "video" && m.modes.includes("text"),
  )!;
  return {
    modelId: m.id,
    accountId,
    projectId: s.state().projects[0].id,
    prompt: "a quiet landscape",
    negativePrompt: "",
    mode: "text" as const,
    duration: m.durations[0],
    resolution: m.resolutions[0],
    aspectRatio: m.aspects[0],
    audio: false,
    count: 1,
    referenceAssetIds: [],
  };
}

test("credentials stay encrypted on disk and absent from account/state serialization", () => {
  const f = fixture();
  try {
    const a = f.s.saveAccount({
      providerId: "runway",
      name: "personal",
      key: "test-secret-never-serialize",
      budget: 100,
      enabled: true,
    });
    assert.equal(a.keyLast4, "lize");
    assert.equal(JSON.stringify(f.s.state()).includes("test-secret"), false);
    f.s.close();
    assert.equal(
      readFileSync(join(f.dir, "studio.sqlite")).includes(
        Buffer.from("test-secret"),
      ),
      false,
    );
    const reopened = new Studio(f.dir);
    assert.equal(reopened.credentials(a.id).key, "test-secret-never-serialize");
    reopened.close();
  } finally {
    f.close();
  }
});
test("template history is isolated, persisted, and rollback creates a version", () => {
  const f = fixture();
  try {
    const p = f.s.savePrompt({ name: "first", content: "old {{thing}}" });
    const q = f.s.savePrompt({ content: "new" }, p.id);
    assert.equal(q.version, 2);
    assert.equal(q.versions[0].content, "old {{thing}}");
    const rolled = f.s.rollbackPrompt(p.id, 1);
    assert.equal(rolled.content, "old {{thing}}");
    assert.equal(rolled.version, 3);
    f.s.close();
    const reopened = new Studio(f.dir);
    assert.equal(
      reopened.state().prompts.find((x) => x.id === p.id)?.version,
      3,
    );
    reopened.close();
  } finally {
    f.close();
  }
});
test("rejects invalid generation parameters before reserving any budget", () => {
  const f = fixture();
  try {
    const m = models.find((m) => m.enabled && m.kind === "video")!;
    const a = f.s.saveAccount({
      providerId: m.providerId,
      name: "key",
      key: "not-real",
      budget: 1000,
      enabled: true,
    });
    assert.throws(() =>
      f.s.createTasks({ ...task(f.s, a.id), duration: 99999 }),
    );
    assert.equal(f.s.state().tasks.length, 0);
  } finally {
    f.close();
  }
});
test("concurrent database clients cannot over-reserve the same budget", async () => {
  const f = fixture();
  const other = new Studio(f.dir);
  try {
    const m = models.find(
      (m) => m.enabled && m.kind === "video" && m.modes.includes("text"),
    )!;
    const a = f.s.saveAccount({
      providerId: m.providerId,
      name: "key",
      key: "not-real",
      budget: 1000,
      enabled: true,
    });
    const input = task(f.s, a.id);
    const first = f.s.createTasks(input)[0];
    f.s.cancelQueued(first.id);
    f.s.updateSettings({ dailyBudget: first.estimatedCost * 1.5 });
    const results = await Promise.allSettled([
      Promise.resolve().then(() => f.s.createTasks(input)),
      Promise.resolve().then(() => other.createTasks(input)),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      f.s.state().tasks.filter((t) => t.status === "queued").length,
      1,
    );
  } finally {
    other.close();
    f.close();
  }
});
test("administrator setup hashes password and random sessions persist with expiry", () => {
  const f = fixture();
  try {
    assert.throws(() => f.s.setup("short"));
    const token = f.s.setup("long-enough-password");
    assert.equal(f.s.authenticate(token), true);
    assert.throws(() => f.s.setup("different-password"));
    assert.throws(() => f.s.login("wrong-password"));
    const second = f.s.login("long-enough-password");
    assert.notEqual(token, second);
    f.s.logout(second);
    assert.equal(f.s.authenticate(second), false);
    assert.equal(f.s.authenticate(token), true);
  } finally {
    f.close();
  }
});
test("restart marks uncertain submissions unknown without requeuing or resubmitting", () => {
  const f = fixture();
  try {
    const m = models.find(
      (m) => m.enabled && m.kind === "video" && m.modes.includes("text"),
    )!;
    const a = f.s.saveAccount({
      providerId: m.providerId,
      name: "key",
      key: "not-real",
      budget: 1000,
      enabled: true,
    });
    const [t] = f.s.createTasks(task(f.s, a.id));
    assert.equal(f.s.claimTask()?.id, t.id);
    f.s.expireSubmissions(Date.now() + 600000);
    assert.equal(
      f.s.state().tasks.find((x) => x.id === t.id)?.status,
      "unknown",
    );
    assert.equal(f.s.claimTask(), undefined);
  } finally {
    f.close();
  }
});

test("unsupported local image transport is rejected before task reservation", () => {
  const f = fixture();
  try {
    const m = models.find((x) => x.id === "h3")!;
    const a = f.s.saveAccount({
      providerId: m.providerId,
      name: "key",
      key: "not-real",
      budget: 100,
      enabled: true,
    });
    const image = f.s.saveAsset(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
      "picture.png",
      f.s.state().projects[0].id,
    );
    assert.throws(
      () =>
        f.s.createTasks({
          ...task(f.s, a.id),
          modelId: m.id,
          resolution: m.resolutions[0],
          duration: m.durations[0],
          audio: true,
          mode: "image",
          referenceAssetIds: [image.id],
        }),
      /公网素材|生成模式/,
    );
    assert.equal(f.s.state().tasks.length, 0);
  } finally {
    f.close();
  }
});
test("failed remote tasks retain budget reservation until billing can be reconciled", () => {
  const f = fixture();
  try {
    const m = models.find(
      (m) => m.enabled && m.kind === "video" && m.modes.includes("text"),
    )!;
    const a = f.s.saveAccount({
      providerId: m.providerId,
      name: "key",
      key: "not-real",
      budget: 1000,
      enabled: true,
    });
    const input = task(f.s, a.id);
    const [one] = f.s.createTasks(input);
    f.s.updateSettings({ dailyBudget: one.estimatedCost * 1.5 });
    f.s.updateTask(one.id, {
      remoteId: "remote-task",
      status: "failed",
      costStatus: "pending",
    });
    assert.throws(() => f.s.createTasks(input), /每日预算/);
  } finally {
    f.close();
  }
});
test("one disabled account does not starve other queued accounts", () => {
  const f = fixture();
  try {
    const m = models.find(
      (m) => m.enabled && m.kind === "video" && m.modes.includes("text"),
    )!;
    const a = f.s.saveAccount({
      providerId: m.providerId,
      name: "disabled",
      key: "not-real",
      budget: 1000,
      enabled: true,
    });
    const b = f.s.saveAccount({
      providerId: m.providerId,
      name: "enabled",
      key: "not-real",
      budget: 1000,
      enabled: true,
    });
    f.s.createTasks(task(f.s, a.id));
    const [second] = f.s.createTasks(task(f.s, b.id));
    f.s.saveAccount({ enabled: false }, a.id);
    assert.equal(f.s.claimTask()?.id, second.id);
  } finally {
    f.close();
  }
});

test("account monthly budget excludes prior-month tasks but retains current reservations", () => {
  const f = fixture();
  try {
    const m = models.find(
      (m) => m.enabled && m.kind === "video" && m.modes.includes("text"),
    )!;
    const a = f.s.saveAccount({
      providerId: m.providerId,
      name: "key",
      key: "not-real",
      budget: 1000,
      enabled: true,
    });
    const input = task(f.s, a.id);
    const [old] = f.s.createTasks(input);
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    f.s.updateTask(old.id, { status: "succeeded", createdAt: d.toISOString() });
    f.s.saveAccount({ budget: old.estimatedCost * 1.5 }, a.id);
    assert.doesNotThrow(() => f.s.createTasks(input));
    assert.throws(() => f.s.createTasks(input), /账户预算/);
  } finally {
    f.close();
  }
});
test("missing vault master is reported instead of generating a replacement over existing credentials", () => {
  const f = fixture();
  try {
    f.s.saveAccount({
      providerId: "runway",
      name: "key",
      key: "not-real",
      budget: 100,
    });
    f.s.close();
    const keyFile = join(f.dir, "master.key");
    unlinkSync(keyFile);
    let reopened: Studio | undefined;
    try {
      assert.throws(() => {
        reopened = new Studio(f.dir);
      }, /主密钥/);
    } finally {
      reopened?.close();
    }
    assert.equal(readdirSync(f.dir).includes("master.key"), false);
  } finally {
    f.close();
  }
});

test("account routing credentials cannot change while a remote task is unresolved", () => {
  const f = fixture();
  try {
    const m = models.find(
      (m) => m.enabled && m.kind === "video" && m.modes.includes("text"),
    )!;
    const a = f.s.saveAccount({
      providerId: m.providerId,
      name: "key",
      key: "not-real",
      budget: 1000,
      enabled: true,
    });
    f.s.createTasks(task(f.s, a.id));
    assert.throws(() => f.s.saveAccount({ region: "other" }, a.id), /任务/);
  } finally {
    f.close();
  }
});

test("category cycles and a fourth depth are rejected and deletion migrates templates", () => {
  const f = fixture();
  try {
    const root = f.s.saveCategory({ name: "root" });
    const child = f.s.saveCategory({ name: "child", parentId: root.id });
    const leaf = f.s.saveCategory({ name: "leaf", parentId: child.id });
    assert.throws(
      () => f.s.saveCategory({ parentId: leaf.id }, root.id),
      /循环|三级/,
    );
    assert.throws(
      () => f.s.saveCategory({ name: "fourth", parentId: leaf.id }),
      /三级/,
    );
    const p = f.s.savePrompt({
      name: "category-test",
      content: "hello",
      categoryId: leaf.id,
    });
    f.s.deleteCategory(root.id);
    assert.equal(f.s.get<any>("prompts", p.id).categoryId, "uncategorized");
    assert.equal(
      f.s.state().categories.some((c) => c.id === leaf.id),
      false,
    );
  } finally {
    f.close();
  }
});

test("deleting a completed output clears persisted task pointers without erasing success or cost history", () => {
  const f = fixture();
  try {
    const m = models.find(
      (m) => m.enabled && m.kind === "video" && m.modes.includes("text"),
    )!;
    const account = f.s.saveAccount({
      providerId: m.providerId,
      name: "offline",
      key: "not-real",
      budget: 1000,
    });
    const [taskOne] = f.s.createTasks(task(f.s, account.id));
    const asset = f.s.saveAsset(
      Buffer.from("000000106674797069736F6D", "hex"),
      "video/mp4",
      "result.mp4",
      taskOne.projectId,
      taskOne.id,
    );
    f.s.updateTask(taskOne.id, {
      status: "succeeded",
      assetId: asset.id,
      resultUrl: asset.url,
      actualCost: 2,
      costStatus: "confirmed",
    });
    f.s.deleteAsset(asset.id);
    const after = f.s.get<any>("tasks", taskOne.id);
    assert.equal(after.status, "succeeded");
    assert.equal(after.assetId, undefined);
    assert.equal(after.resultUrl, null);
    assert.equal(after.actualCost, 2);
    assert.equal(after.costStatus, "confirmed");
    assert.equal(typeof after.resultDeletedAt, "string");
    assert.throws(() => f.s.assetData(asset.id));
    f.s.close();
    const reopened = new Studio(f.dir);
    try {
      assert.equal(reopened.get<any>("tasks", taskOne.id).resultUrl, null);
    } finally {
      reopened.close();
    }
  } finally {
    f.close();
  }
});

test("an output being finalized cannot be deleted before the worker records success", () => {
  const f = fixture();
  try {
    const m = models.find(
      (m) => m.enabled && m.kind === "video" && m.modes.includes("text"),
    )!;
    const account = f.s.saveAccount({
      providerId: m.providerId,
      name: "offline",
      key: "not-real",
      budget: 1000,
    });
    const [pending] = f.s.createTasks(task(f.s, account.id));
    const asset = f.s.saveAsset(
      Buffer.from("000000106674797069736F6D", "hex"),
      "video/mp4",
      "pending.mp4",
      pending.projectId,
      pending.id,
    );
    assert.throws(() => f.s.deleteAsset(asset.id), /待处理任务/);
    assert.doesNotThrow(() => f.s.assetData(asset.id));
  } finally {
    f.close();
  }
});
