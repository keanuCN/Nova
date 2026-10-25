import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billingPeriod,
  isBudgetCommitted,
  orderTasks,
} from "../src/shared/domain";
import type { GenerationTask } from "../src/shared/types";
test("Shanghai month and day roll forward eight hours before UTC", () => {
  assert.deepEqual(billingPeriod("2026-10-31T16:15:00.000Z"), {
    month: "2026-11",
    day: "2026-11-01",
  });
});
test("uncertain cancelled tasks retain budget while safe failures release it", () => {
  assert.equal(
    isBudgetCommitted({ status: "cancelled", costStatus: "pending" }),
    true,
  );
  assert.equal(
    isBudgetCommitted({ status: "cancelled", costStatus: "estimated" }),
    false,
  );
  assert.equal(
    isBudgetCommitted({ status: "failed", costStatus: "estimated" }),
    false,
  );
  assert.equal(
    isBudgetCommitted({ status: "failed", costStatus: "pending" }),
    true,
  );
});
test("new queued tasks stay visible ahead of a large completed history", () => {
  const list = Array.from(
    { length: 10 },
    (_, i) =>
      ({
        id: String(i),
        status: "succeeded",
        createdAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      }) as GenerationTask,
  );
  const queued = {
    id: "new",
    status: "queued",
    createdAt: "2026-10-24T00:00:00Z",
  } as GenerationTask;
  assert.equal(orderTasks([...list, queued]).slice(0, 8)[0].id, "new");
  assert.equal(list[0].id, "0");
});
