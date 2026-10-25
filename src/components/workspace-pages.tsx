"use client";
import { useEffect, useRef, useState } from "react";
import {
  FolderPlus,
  Upload,
  Download,
  Image as ImageIcon,
  Film,
  AudioLines,
  FolderOpen,
  Trash2,
  Search,
  ArrowUpRight,
  ReceiptText,
  TrendingUp,
  Wallet,
  Clock3,
  ShieldCheck,
  SlidersHorizontal,
  LogOut,
  Check,
  Database,
  HardDrive,
  RefreshCw,
  CircleAlert,
  ChevronRight,
  X,
  Settings2,
} from "lucide-react";
import type { Asset, GenerationTask, Project } from "@/shared/types";
import { billingPeriod, isBudgetCommitted, orderTasks } from "@/shared/domain";
import { Badge, Button, Empty, Field, Modal, Money } from "./ui";
import type { PageProps } from "./studio";
const labels: Record<string, string> = {
  queued: "排队中",
  submitting: "提交中",
  processing: "生成中",
  succeeded: "成功",
  failed: "失败",
  unknown: "待核对",
  cancelled: "已取消",
};
export function AssetsPage({
  state,
  api,
  refresh,
  notify,
  projectId,
  setProjectId,
}: PageProps & { projectId: string; setProjectId: (id: string) => void }) {
  const [tab, setTab] = useState("assets");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [newProject, setNewProject] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Asset | null>(null);
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [remove, setRemove] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new"))
      setNewProject(true);
  }, []);
  const assets = state.assets.filter(
    (a) =>
      (a.projectId === projectId || projectId === "all") &&
      (kind === "all" || a.kind === kind) &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const tasks = state.tasks.filter(
    (t) =>
      (t.projectId === projectId || projectId === "all") &&
      (!search || t.prompt.toLowerCase().includes(search.toLowerCase())),
  );
  const project = state.projects.find((p) => p.id === projectId);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set("file", file);
        body.set("projectId", projectId === "all" ? "default" : projectId);
        await api("assets", body);
      }
      await refresh();
      notify("素材已保存至项目");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  return (
    <div>
      <div className="page-titlebar">
        <div>
          <div className="eyebrow">收纳每一帧灵感</div>
          <h1>项目与素材</h1>
          <p>从第一张参考图，到最后一个镜头，创作始终有迹可循。</p>
        </div>
        <div className="title-actions">
          <Button onClick={() => setNewProject(true)}>
            <FolderPlus size={16} />
            新建项目
          </Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={16} />
            上传素材
          </Button>
          <input
            type="file"
            hidden
            ref={fileRef}
            accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,video/mp4,video/webm"
            multiple
            onChange={(e) => void upload(e.target.files)}
          />
        </div>
      </div>
      <div className="project-cards">
        {state.projects.map((p) => (
          <button
            className={`project-card ${projectId === p.id ? "selected" : ""}`}
            key={p.id}
            onClick={() => setProjectId(p.id)}
          >
            <span>
              <FolderOpen size={24} />
            </span>
            <div>
              <strong>{p.name}</strong>
              <p>{p.description || "一个新的创作故事"}</p>
              <small>
                {state.assets.filter((a) => a.projectId === p.id).length} 个素材
                · {state.tasks.filter((t) => t.projectId === p.id).length}{" "}
                个任务
              </small>
            </div>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
      <div className="asset-toolbar">
        <div className="tab-group">
          <button
            className={tab === "assets" ? "active" : ""}
            onClick={() => setTab("assets")}
          >
            素材资产 <span>{assets.length}</span>
          </button>
          <button
            className={tab === "tasks" ? "active" : ""}
            onClick={() => setTab("tasks")}
          >
            生成历史 <span>{tasks.length}</span>
          </button>
        </div>
        <div className="title-actions">
          {tab === "assets" && (
            <select
              aria-label="素材类型"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">全部类型</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
              <option value="audio">音频</option>
            </select>
          )}
          <div className="search-field">
            <Search size={15} />
            <input
              placeholder="搜索素材或提示词…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>
      {tab === "assets" ? (
        assets.length ? (
          <div className="asset-grid">
            {assets.map((a) => (
              <article className="asset-card" key={a.id}>
                <button className="asset-preview" onClick={() => setPreview(a)}>
                  {a.kind === "image" ? (
                    <img src={a.url} alt={a.name} />
                  ) : a.kind === "video" ? (
                    <Film size={42} />
                  ) : (
                    <AudioLines size={42} />
                  )}
                  <Badge>
                    {a.kind === "image"
                      ? "图片"
                      : a.kind === "video"
                        ? "视频"
                        : "音频"}
                  </Badge>
                </button>
                <div>
                  <strong title={a.name}>{a.name}</strong>
                  <small>
                    {(a.size / 1024 / 1024).toFixed(2)} 兆字节 ·{" "}
                    {new Date(a.createdAt).toLocaleDateString("zh-CN")}
                  </small>
                  <footer>
                    <a className="btn btn-ghost" href={a.url} download={a.name}>
                      <Download size={14} />
                      下载
                    </a>
                    <button
                      className="icon-btn"
                      aria-label={`删除${a.name}`}
                      onClick={() => setRemove(a)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </footer>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div
            className="asset-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void upload(e.dataTransfer.files);
            }}
          >
            <Empty
              icon={<FolderOpen size={30} />}
              title="为你的故事，收集第一份素材"
              description="将图片、音频或视频拖到这里，也可以从本机上传。"
              action={
                <Button busy={busy} onClick={() => fileRef.current?.click()}>
                  <Upload size={15} />
                  选择文件
                </Button>
              }
            />
            <span className="small muted">
              文件私有保存 · 每个文件最大 50 兆字节
            </span>
          </div>
        )
      ) : (
        <TaskTable tasks={tasks} state={state} onSelect={setTask} />
      )}
      <Modal
        open={newProject}
        onClose={() => setNewProject(false)}
        title="新建创作项目"
        description="用项目组织素材和生成记录。"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const p = await api<Project>("projects", { name, description });
              await refresh();
              setProjectId(p.id);
              setNewProject(false);
              setName("");
              setDescription("");
              notify("项目已创建");
            } catch (e) {
              notify((e as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="modal-body">
            <Field label="项目名称">
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：深空回响 · 第一章"
              />
            </Field>
            <Field label="项目说明">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="记录这个项目的创作方向"
              />
            </Field>
          </div>
          <div className="modal-footer">
            <Button type="button" onClick={() => setNewProject(false)}>
              取消
            </Button>
            <Button variant="primary" type="submit" busy={busy}>
              创建项目
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name || "素材预览"}
        wide
      >
        <div className="modal-body large-preview">
          {preview?.kind === "image" ? (
            <img src={preview.url} alt={preview.name} />
          ) : preview?.kind === "video" ? (
            <video controls src={preview.url} />
          ) : preview ? (
            <audio controls src={preview.url} />
          ) : null}
        </div>
      </Modal>
      <Modal
        open={!!task}
        onClose={() => setTask(null)}
        title="任务与提示词快照"
        description="任务创建时冻结的内容，不随原始模板变更。"
        wide
      >
        {task && (
          <div className="modal-body">
            <div className="task-detail-meta">
              <Badge tone={task.status === "succeeded" ? "green" : "muted"}>
                {labels[task.status]}
              </Badge>
              <span className="mono">{task.id}</span>
            </div>
            <div className="template-preview">{task.prompt}</div>
            <dl className="template-meta">
              <div>
                <dt>模型</dt>
                <dd>{state.models.find((m) => m.id === task.modelId)?.name}</dd>
              </div>
              <div>
                <dt>规格</dt>
                <dd>
                  {task.input.resolution} / {task.input.aspectRatio} /{" "}
                  {task.input.duration} 秒
                </dd>
              </div>
              <div>
                <dt>预计成本</dt>
                <dd>
                  <Money value={task.estimatedCost} />
                </dd>
              </div>
              <div>
                <dt>实际扣款</dt>
                <dd>
                  {task.actualCost === null ? (
                    "待核对"
                  ) : (
                    <Money value={task.actualCost} />
                  )}
                </dd>
              </div>
              <div>
                <dt>原始任务编号</dt>
                <dd>{task.remoteId || "尚未提交"}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{new Date(task.createdAt).toLocaleString("zh-CN")}</dd>
              </div>
            </dl>
            {task.error && <div className="inline-error">{task.error}</div>}
            {task.resultUrl && (
              <a href={task.resultUrl} download className="btn btn-primary">
                <Download size={15} />
                下载结果
              </a>
            )}
          </div>
        )}
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title="删除素材？"
        description={`“${remove?.name || ""}”将从本地存储移除。正在使用的素材可能无法删除。`}
      >
        <div className="modal-footer">
          <Button onClick={() => setRemove(null)}>取消</Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await api(`assets/${remove?.id}`, {}, "DELETE");
                await refresh();
                setRemove(null);
                notify("素材已删除");
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            删除素材
          </Button>
        </div>
      </Modal>
    </div>
  );
}
export function BillingPage({ state, notify }: PageProps) {
  const [filter, setFilter] = useState("all");
  const [providerId, setProviderId] = useState("");
  const now = new Date();
  const month = billingPeriod(now).month;
  const monthly = state.tasks.filter(
    (t) => billingPeriod(t.createdAt).month === month && isBudgetCommitted(t),
  );
  const confirmed = monthly
    .filter((t) => t.actualCost !== null)
    .reduce((sum, t) => sum + (t.actualCost || 0), 0);
  const reserved = monthly
    .filter((t) => t.actualCost === null)
    .reduce((sum, t) => sum + t.estimatedCost, 0);
  const tasks = state.tasks.filter(
    (t) =>
      (filter === "all" ||
        (filter === "pending" && t.actualCost === null) ||
        (filter === "confirmed" && t.actualCost !== null)) &&
      (!providerId ||
        state.models.find((m) => m.id === t.modelId)?.providerId ===
          providerId),
  );
  const ratio = Math.min(
    ((confirmed + reserved) / state.settings.monthlyBudget) * 100,
    100,
  );
  const groups = state.providers
    .map((p) => ({
      provider: p,
      value: monthly
        .filter(
          (t) =>
            state.models.find((m) => m.id === t.modelId)?.providerId === p.id,
        )
        .reduce((n, t) => n + (t.actualCost ?? t.estimatedCost), 0),
    }))
    .filter((x) => x.value > 0);
  return (
    <div>
      <div className="page-titlebar">
        <div>
          <div className="eyebrow">清晰掌握创作开销</div>
          <h1>费用中心</h1>
          <p>在灵感与预算之间，始终心中有数。</p>
        </div>
        <Button
          onClick={() => {
            const rows = [
              [
                "任务",
                "模型",
                "状态",
                "预估人民币",
                "实际或用量估算人民币",
                "费用口径",
                "创建时间",
              ],
              ...tasks.map((t) => [
                t.id,
                state.models.find((m) => m.id === t.modelId)?.name || "",
                labels[t.status],
                t.estimatedCost,
                String(t.actualCost ?? ""),
                t.costStatus,
                t.createdAt,
              ]),
            ];
            downloadText(
              "\ufeff" +
                rows
                  .map((r) =>
                    r
                      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                      .join(","),
                  )
                  .join("\r\n"),
              "Nova-费用明细.csv",
              "text/csv",
            );
            notify("费用明细已导出");
          }}
        >
          <Download size={16} />
          导出费用明细
        </Button>
      </div>
      <div className="billing-overview">
        <section className="panel monthly-budget">
          <div className="panel-header">
            <h2>
              <Wallet size={17} />
              本月创作预算
            </h2>
            <Badge>
              {now.getFullYear()} 年 {now.getMonth() + 1} 月
            </Badge>
          </div>
          <div className="budget-big">
            <Money value={confirmed + reserved} />
            <span>
              / <Money value={state.settings.monthlyBudget} />
            </span>
          </div>
          <p>本站已知费用与预留估算</p>
          <div className="budget-track">
            <span style={{ width: `${ratio}%` }} />
          </div>
          <div className="budget-track-caption">
            <span>已占用 {ratio.toFixed(1)}%</span>
            <span>
              剩余{" "}
              <Money
                value={Math.max(
                  0,
                  state.settings.monthlyBudget - confirmed - reserved,
                )}
              />
            </span>
          </div>
          <a className="inline-link" href="/settings">
            调整预算 <ArrowUpRight size={13} />
          </a>
        </section>
        <div className="billing-stat-stack">
          <div className="metric">
            <div>
              <span>已返回金额的任务费用</span>
              <Check size={17} />
            </div>
            <strong>
              <Money value={confirmed} />
            </strong>
            <p>具体口径以每条任务的费用状态为准</p>
          </div>
          <div className="metric">
            <div>
              <span>预留与待核对金额</span>
              <Clock3 size={17} />
            </div>
            <strong>
              <Money value={reserved} />
            </strong>
            <p>尚未拿到实际扣费，保留预算占用</p>
          </div>
        </div>
        <section className="panel provider-spending">
          <div className="panel-header">
            <h2>按服务商分布</h2>
            <span className="small muted">本月 · 估算口径</span>
          </div>
          {groups.length ? (
            <div className="spending-bars">
              {groups.map(({ provider: p, value }) => (
                <div key={p.id}>
                  <div>
                    <span>{p.name}</span>
                    <Money value={value} />
                  </div>
                  <span className="spending-track">
                    <i
                      style={{
                        width: `${Math.max(3, (value / Math.max(...groups.map((g) => g.value))) * 100)}%`,
                        background: p.color,
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={<TrendingUp size={23} />}
              title="还没有费用记录"
              description="开始生成后，这里会展示实际任务用量。"
            />
          )}
        </section>
      </div>
      <div className="cost-notice">
        <CircleAlert size={16} />
        <span>
          这里记录本站发起的任务。预估价格、用量估算与官方扣款分别标注；其他客户端的消费请前往厂商账单核对。
        </span>
      </div>
      <div className="asset-toolbar">
        <div className="tab-group">
          {[
            { id: "all", name: "全部明细" },
            { id: "pending", name: "预估与待核对" },
            { id: "confirmed", name: "已返回金额" },
          ].map((t) => (
            <button
              className={filter === t.id ? "active" : ""}
              key={t.id}
              onClick={() => setFilter(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <select
          aria-label="按服务商筛选费用"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
        >
          <option value="">全部服务商</option>
          {state.providers.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <TaskTable tasks={tasks} state={state} />
    </div>
  );
}
function TaskTable({
  tasks,
  state,
  onSelect,
}: {
  tasks: GenerationTask[];
  state: PageProps["state"];
  onSelect?: (t: GenerationTask) => void;
}) {
  return tasks.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>任务 / 提示词</th>
            <th>模型</th>
            <th>状态</th>
            <th>预估费用</th>
            <th>实际 / 用量金额</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>
                <button
                  className="table-task"
                  disabled={!onSelect}
                  onClick={() => onSelect?.(t)}
                >
                  <strong>{t.prompt}</strong>
                  <small className="mono">{t.id.slice(0, 14)}</small>
                </button>
              </td>
              <td>{state.models.find((m) => m.id === t.modelId)?.name}</td>
              <td>
                <Badge
                  tone={
                    t.status === "succeeded"
                      ? "green"
                      : t.status === "failed"
                        ? "red"
                        : "muted"
                  }
                >
                  {labels[t.status]}
                </Badge>
              </td>
              <td>
                <Money value={t.estimatedCost} />
              </td>
              <td>
                {t.actualCost === null ? (
                  <span className="muted">待核对</span>
                ) : (
                  <>
                    <Money value={t.actualCost} />
                    <small className="cost-basis">
                      {t.costStatus === "confirmed" ? "官方确认" : "按用量估算"}
                    </small>
                  </>
                )}
              </td>
              <td className="small muted">
                {new Date(t.createdAt).toLocaleString("zh-CN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="panel">
      <Empty
        icon={<ReceiptText size={26} />}
        title="暂无任务记录"
        description="任务提交后会保留参数、费用估算与生成结果。"
      />
    </div>
  );
}
export function SettingsPage({
  state,
  api,
  refresh,
  notify,
  logout,
}: PageProps & { logout: () => Promise<void> }) {
  const [settings, setSettings] = useState(state.settings);
  const [busy, setBusy] = useState(false);
  return (
    <div className="settings-page">
      <div className="page-titlebar">
        <div>
          <div className="eyebrow">按你的习惯设置工作台</div>
          <h1>工作台设置</h1>
          <p>为你的创作节奏，设置合适的边界。</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="panel-header">
            <h2>
              <SlidersHorizontal size={17} />
              预算与任务
            </h2>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("settings", settings, "PATCH");
                await refresh();
                notify("工作台设置已保存");
              } catch (e) {
                notify((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="settings-fields">
              <div className="form-grid">
                <Field label="每月预算（元）">
                  <input
                    required
                    type="number"
                    min={1}
                    max={1000000}
                    value={settings.monthlyBudget}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        monthlyBudget: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="每日预算（元）">
                  <input
                    required
                    type="number"
                    min={1}
                    max={1000000}
                    value={settings.dailyBudget}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        dailyBudget: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="单次任务上限（元）">
                  <input
                    required
                    type="number"
                    min={0.01}
                    step="0.01"
                    max={100000}
                    value={settings.perTaskLimit}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        perTaskLimit: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="最大并发任务">
                  <input
                    required
                    type="number"
                    min={1}
                    max={5}
                    value={settings.concurrency}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        concurrency: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="美元预算换算汇率" hint="人民币 / 美元 · 手动设置">
                <input
                  required
                  type="number"
                  min={1}
                  max={20}
                  step="0.01"
                  value={settings.currencyRate}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      currencyRate: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <p className="settings-hint">
                预算控制本站创建的任务，不限制其他客户端。汇率只用于本站估价，不代表实际结算汇率。
              </p>
            </div>
            <div className="settings-save">
              <Button variant="primary" type="submit" busy={busy}>
                <Check size={16} />
                保存设置
              </Button>
            </div>
          </form>
        </section>
        <div>
          <section className="panel settings-panel">
            <div className="panel-header">
              <h2>
                <ShieldCheck size={17} />
                私有与安全
              </h2>
              <Badge tone="green">本地私有</Badge>
            </div>
            <div className="security-list">
              <div>
                <LockIcon />
                <span>
                  <strong>凭据加密保存</strong>
                  <small>客户端只接收密钥尾号，不返回明文。</small>
                </span>
              </div>
              <div>
                <Database size={19} />
                <span>
                  <strong>本地持久化数据库</strong>
                  <small>模板、任务与素材保存在服务端 data 目录。</small>
                </span>
              </div>
              <div>
                <HardDrive size={19} />
                <span>
                  <strong>备份你的创作资产</strong>
                  <small>
                    停止应用与 Worker 后，完整备份 data
                    目录；加密主密钥应同时妥善保留。
                  </small>
                </span>
              </div>
            </div>
          </section>
          <section className="panel settings-panel session-panel">
            <div>
              <h2>当前会话</h2>
              <p>离开共享设备前，退出工作台。</p>
            </div>
            <Button onClick={() => void logout()}>
              <LogOut size={15} />
              退出登录
            </Button>
          </section>
        </div>
      </div>
      <div className="settings-version">
        <span className="brand-icon">
          <Film size={20} />
        </span>
        <div>
          <strong>Nova</strong>
          <small>0.1.0 · 个人本地版</small>
        </div>
        <p>用你的模型，讲你的故事。</p>
      </div>
    </div>
  );
}
function LockIcon() {
  return <ShieldCheck size={19} />;
}
function downloadText(text: string, name: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
