"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  Clapperboard,
  ImagePlus,
  Layers3,
  Type,
  WandSparkles,
  Braces,
  BookmarkPlus,
  ChevronDown,
  Upload,
  Play,
  Download,
  RefreshCw,
  Clock3,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  ArrowUpRight,
  Volume2,
  Maximize2,
  Sparkles,
  Film,
  AudioLines,
  X,
  ChevronRight,
  SlidersHorizontal,
  CirclePause,
} from "lucide-react";
import type {
  Asset,
  GenerationTask,
  Mode,
  PromptTemplate,
  TaskInput,
} from "@/shared/types";
import {
  estimateCost,
  extractVariables,
  renderTemplate,
  orderTasks,
} from "@/shared/domain";
import { getProvider } from "@/shared/catalog";
import { savePromptResume, takeDraft, takePromptResume } from "@/shared/transfer";
import { Badge, Button, Empty, Field, Modal, Money } from "./ui";
import type { PageProps } from "./studio";
const initialPrompt =
  "电影级微距镜头，深海发光水母在墨蓝色的深渊中缓缓起伏，触须呈现青绿色半透明生物荧光，水体中有细腻的浮游粒子与丁达尔光线。缓慢推进并轻微环绕，浅景深，自然流畅的运动，安静而神秘的氛围。";
const statusLabels: Record<string, string> = {
  queued: "等待调度",
  submitting: "正在提交",
  processing: "生成中",
  succeeded: "已完成",
  failed: "生成失败",
  unknown: "状态待核对",
  cancelled: "已取消",
};
export function VideoStudio({
  state,
  api,
  refresh,
  notify,
  audio,
  projectId,
  draft,
  clearDraft,
  onChooseTemplate,
}: PageProps & {
  audio: boolean;
  projectId: string;
  draft: { text: string; template: PromptTemplate } | null;
  clearDraft: () => void;
  onChooseTemplate: () => void;
}) {
  const available = state.models.filter(
    (m) => m.kind === (audio ? "audio" : "video"),
  );
  const [modelId, setModelId] = useState(audio ? "speech-turbo" : "wan3");
  const model = available.find((m) => m.id === modelId) || available[0];
  const [prompt, setPrompt] = useState(
    audio
      ? "在阳光尚未抵达的深海，光，是生命最温柔的语言。让我们放慢脚步，听见自然的声音。"
      : initialPrompt,
  );
  const [negative, setNegative] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [resolution, setResolution] = useState(model.resolutions[0]);
  const [duration, setDuration] = useState(model.durations[0]);
  const durationIndex = Math.max(0, model.durations.indexOf(duration));
  const durationProgress =
    model.durations.length <= 1
      ? 100
      : (durationIndex / (model.durations.length - 1)) * 100;
  const [aspect, setAspect] = useState("16:9");
  const [sound, setSound] = useState(true);
  const [count, setCount] = useState(1);
  const [accountId, setAccountId] = useState("");
  const [modelMenu, setModelMenu] = useState(false);
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState("");
  const [variableOpen, setVariableOpen] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [template, setTemplate] = useState<PromptTemplate | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [voiceId, setVoiceId] = useState("");
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [optimizeAccountId, setOptimizeAccountId] = useState("");
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded =
      takeDraft(sessionStorage, audio ? "audio" : "video") || draft;
    if (loaded) {
      setPrompt(loaded.text);
      setTemplate(loaded.template);
      setModelId(loaded.template.modelId);
      setVariables(loaded.template.defaults);
      clearDraft();
    }
  }, [draft, audio]);
  useEffect(() => {
    const resumed = takePromptResume(sessionStorage, audio ? "audio" : "video");
    if (!resumed) return;
    setPrompt(resumed.text);
    setTemplate(resumed.template || null);
    if (resumed.template) {
      setModelId(resumed.template.modelId);
      setVariables(resumed.template.defaults);
    }
  }, [audio]);
  useEffect(() => {
    setResolution(
      model.resolutions.includes("720p") ? "720p" : model.resolutions[0],
    );
    setDuration(model.durations[0]);
    setSound(model.audio && !audio);
    setNegative("");
    setVoiceId(model.voiceId || "");
    setAspect(
      model.aspects.includes(aspect) ? aspect : model.aspects[0] || "16:9",
    );
    if (!model.modes.includes(mode)) setMode("text");
  }, [model.id]); // model capability changes reset only incompatible controls
  const accounts = state.accounts.filter(
    (a) => a.providerId === model.providerId && a.enabled,
  );
  const deepseekAccounts = state.accounts.filter(
    (a) => a.providerId === "deepseek" && a.enabled,
  );
  useEffect(() => {
    if (!accounts.some((a) => a.id === accountId))
      setAccountId(accounts[0]?.id || "");
  }, [model.id, state.accounts]);
  useEffect(() => {
    if (!deepseekAccounts.some((a) => a.id === optimizeAccountId))
      setOptimizeAccountId(deepseekAccounts[0]?.id || "");
  }, [state.accounts]);
  const taskInput: TaskInput = {
    modelId: model.id,
    accountId,
    projectId,
    prompt,
    negativePrompt: negative,
    mode,
    duration,
    resolution,
    aspectRatio: aspect,
    audio: sound,
    count,
    referenceAssetIds: referenceIds,
    templateId: template?.id,
    templateVersion: template?.version,
    voiceId,
  };
  const estimate = useMemo(() => {
    try {
      return estimateCost(model, taskInput, state.settings.currencyRate);
    } catch {
      return 0;
    }
  }, [model, resolution, duration, prompt, count, state.settings.currencyRate]);
  const tasks = orderTasks(
    state.tasks.filter(
      (t) =>
        t.kind === (audio ? "audio" : "video") && t.projectId === projectId,
    ),
  );
  const activeTask =
    tasks.find((t) => t.id === activeTaskId) ||
    tasks.find((t) => t.status === "succeeded");
  const references = state.assets.filter((a) => referenceIds.includes(a.id));
  const provider = getProvider(model.providerId);
  const vars = extractVariables(prompt);
  async function optimizePrompt() {
    if (!optimizeAccountId) return;
    setOptimizing(true);
    setOptimizeError("");
    try {
      const result = await api<{ prompt: string }>("prompts/optimize", {
        accountId: optimizeAccountId,
        kind: audio ? "audio" : "video",
        prompt,
      });
      setOptimizedPrompt(result.prompt);
    } catch (e) {
      setOptimizeError((e as Error).message);
    } finally {
      setOptimizing(false);
    }
  }
  async function submit() {
    if (!accountId) {
      window.location.assign("/accounts");
      return;
    }
    if (vars.length) {
      notify("请先填写提示词中的模板变量", true);
      setVariableOpen(true);
      return;
    }
    setBusy(true);
    try {
      const result = await api<GenerationTask[]>("tasks", taskInput);
      setActiveTaskId(result[0]?.id || "");
      await refresh();
      notify(`已加入队列，共 ${result.length} 个任务`);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set("file", file);
        body.set("projectId", projectId);
        const asset = await api<Asset>("assets", body);
        setReferenceIds((ids) => [...ids, asset.id]);
      }
      await refresh();
      notify("参考素材已上传");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  return (
    <div className="creation-page">
      <div className="page-titlebar compact">
        <div>
          <div className="breadcrumb">
            创作空间 <ChevronRight size={12} />{" "}
            {audio ? "音频生成" : "视频生成"}
          </div>
          <h1>
            {audio ? "让文字，拥有声音" : "让灵感，成为下一个镜头"}
            <span className="title-dot" />
          </h1>
        </div>
        <div className="title-actions">
          <Badge tone="green">{audio ? "音频创作" : "视频创作"}</Badge>
          <span className="muted small">私有创作 · 自带密钥</span>
        </div>
      </div>
      <div className={`studio-grid ${audio ? "audio-studio" : ""}`}>
        <section className="panel composer-panel">
          <div className="composer-panel-heading">
            <div>
              <span className="eyebrow">创作工作区</span>
              <h2>
                <WandSparkles size={17} />
                创作设置
              </h2>
            </div>
            <p>提示词与生成参数在同一工作区中调整</p>
          </div>
          <div className="studio-input-column">
            <section className="prompt-panel">
              <div className="mode-tabs">
                {(audio
                  ? [{ id: "text", label: "文字配音", icon: AudioLines }]
                  : [
                      { id: "text", label: "文生视频", icon: Type },
                      { id: "image", label: "图生视频", icon: ImagePlus },
                      { id: "reference", label: "多素材参考", icon: Layers3 },
                    ]
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    className={mode === id ? "selected" : ""}
                    disabled={!model.modes.includes(id as Mode)}
                    title={
                      !model.modes.includes(id as Mode) ? "当前模型暂不支持" : ""
                    }
                    onClick={() => setMode(id as Mode)}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="prompt-tools">
                <button onClick={onChooseTemplate}>
                  <WandSparkles size={15} />
                  选择模板
                </button>
                <button
                  onClick={() => {
                    if (!vars.length) {
                      setPrompt((p) => `${p}\n{{主体}}`);
                      setVariables((v) => ({ ...v, 主体: "" }));
                    }
                    setVariableOpen(true);
                  }}
                >
                  <Braces size={15} />
                  模板变量
                </button>
              <button
                className="optimize-prompt-btn"
                disabled={!prompt.trim()}
                title="使用已绑定的 DeepSeek 优化当前提示词"
                onClick={() => {
                  setOptimizedPrompt("");
                  setOptimizeError("");
                  setOptimizeOpen(true);
                }}
              >
                <Sparkles size={15} />
                优化提示词
              </button>
                <button
                  className="icon-btn"
                  title="保存为模板"
                  aria-label="保存为模板"
                  onClick={() => setSaveOpen(true)}
                >
                  <BookmarkPlus size={16} />
                </button>
              </div>
              <div className="section-label">
                <span>
                  {audio ? "配音文本" : "核心提示词"}{" "}
                </span>
                <span className="mono">{prompt.length} / 10000</span>
              </div>
              <textarea
                aria-label={audio ? "配音文本" : "核心提示词"}
                className="prompt-editor"
                value={prompt}
                maxLength={10000}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想创造的画面…"
              />
              <div className="prompt-editor-footer">
                <span>
                  <Sparkles size={13} />
                  {template
                    ? `来自模板 · ${template.name}`
                    : "好镜头，始于一个清晰的描述"}
                </span>
                <span className="mono">
                  {template ? `版本 ${template.version}` : "中文文本"}
                </span>
              </div>
              {model.negativePrompt && (
                <Field label="负向提示词">
                  <textarea
                    rows={3}
                    value={negative}
                    onChange={(e) => setNegative(e.target.value)}
                    placeholder="不希望出现的内容"
                  />
                </Field>
              )}
              {!audio && (
                <div className="reference-section">
                  <div className="section-label">
                    <span>
                      参考素材
                    </span>
                    <span className="mono">{references.length} 项</span>
                  </div>
                  <div className="reference-list">
                    {references.map((asset) => (
                      <div className="reference-thumb" key={asset.id}>
                        {asset.kind === "image" ? (
                          <img src={asset.url} alt={asset.name} />
                        ) : (
                          <Film size={22} />
                        )}
                        <button
                          aria-label={`移除${asset.name}`}
                          onClick={() =>
                            setReferenceIds((ids) =>
                              ids.filter((x) => x !== asset.id),
                            )
                          }
                        >
                          <X size={12} />
                        </button>
                        <span>{asset.name}</span>
                      </div>
                    ))}
                    <button
                      className="upload-target"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        void upload(e.dataTransfer.files);
                      }}
                    >
                      {uploading ? (
                        <LoaderCircle size={22} className="spin" />
                      ) : (
                        <ImagePlus size={23} />
                      )}
                      <span>{references.length ? "继续添加" : "拖拽或上传"}</span>
                      <small>图片 · 最大 50 兆字节</small>
                    </button>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    hidden
                    onChange={(e) => void upload(e.target.files)}
                  />
                  {mode === "text" && references.length > 0 && (
                    <small className="warning-text">
                      当前为文生视频，切换为图生视频后使用参考图。
                    </small>
                  )}
                </div>
              )}
            </section>
            <div className="inspiration-note">
              <span className="note-icon">
                <WandSparkles size={18} />
              </span>
              <div>
                <strong>
                  {audio
                    ? "声音，也是叙事的一部分"
                    : "把成功的镜头，变成可复用的语言"}
                </strong>
                <p>保存提示词、参数与参考素材，下次灵感直接开始。</p>
              </div>
              <ArrowUpRight size={17} />
            </div>
          </div>
          <section className="parameters-panel">
            <div className="panel-header">
              <h2>
                <SlidersHorizontal size={16} />
                生成参数
              </h2>
              <span className="eyebrow">模型引擎</span>
            </div>
            <div className="model-picker">
              <button
                className="selected-model"
                onClick={() => setModelMenu(!modelMenu)}
              >
                <span
                  className="provider-mark"
                  style={{
                    color: provider.color,
                    background: `${provider.color}13`,
                  }}
                >
                  {provider.initials}
                </span>
                <span>
                  <strong>{model.name}</strong>
                  <small>
                    {provider.name} · {model.description}
                  </small>
                </span>
                <ChevronDown size={16} />
              </button>
              {modelMenu && (
                <div className="model-menu">
                  {available.map((m) => (
                    <button
                      key={m.id}
                      disabled={!m.enabled}
                      className={m.id === model.id ? "selected" : ""}
                      onClick={() => {
                        setModelId(m.id);
                        setModelMenu(false);
                      }}
                    >
                      <span>
                        <strong>{m.name}</strong>
                        <small>{m.description}</small>
                      </span>
                      <Badge tone={m.enabled ? "green" : "muted"}>
                        {m.enabled ? m.badge || "可接入" : "待接入"}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Field
              label="调用账户"
              hint={accounts.length ? `${accounts.length} 个可用` : "尚未绑定"}
            >
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">请选择已绑定账户</option>
                {accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {!accounts.length && (
              <Link className="inline-link" href="/accounts">
                绑定 {provider.name} 密钥 <ArrowUpRight size={13} />
              </Link>
            )}
            {!audio && (
              <>
                <Field label="画面比例">
                  <div className="aspect-options">
                    {model.aspects.map((r) => (
                      <button
                        key={r}
                        className={aspect === r ? "selected" : ""}
                        onClick={() => setAspect(r)}
                      >
                        <span
                          className={`aspect-icon aspect-${r.replace(":", "-")}`}
                        />
                        <strong>{r}</strong>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="输出分辨率">
                  <div className="segmented">
                    {model.resolutions.map((r) => (
                      <button
                        className={resolution === r ? "selected" : ""}
                        key={r}
                        onClick={() => setResolution(r)}
                      >
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="生成时长" hint="拖动滑块调整">
                  <div className="duration-control">
                    <div className="duration-readout" aria-live="polite">
                      <Clock3 size={15} />
                      <strong>{duration} 秒</strong>
                    </div>
                    <input
                      className="duration-slider"
                      type="range"
                      min={0}
                      max={Math.max(0, model.durations.length - 1)}
                      step={1}
                      value={durationIndex}
                      disabled={model.durations.length <= 1}
                      aria-label="生成时长"
                      aria-valuetext={`${duration} 秒`}
                      style={{ "--range-progress": `${durationProgress}%` } as CSSProperties}
                      onChange={(e) =>
                        setDuration(model.durations[Number(e.target.value)])
                      }
                    />
                    <div className="duration-scale">
                      {model.durations.map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={duration === d ? "selected" : ""}
                          onClick={() => setDuration(d)}
                        >
                          {d} 秒
                        </button>
                      ))}
                    </div>
                  </div>
                </Field>
                <div className="toggle-row">
                  <div>
                    <strong>
                      <Volume2 size={15} />
                      同步生成音轨
                    </strong>
                    <small>
                      {model.providerId === "minimax"
                        ? "模型原生有声输出，无独立开关"
                        : model.audio
                          ? "环境音、对白与画面同步"
                          : "当前模型输出无声视频"}
                    </small>
                  </div>
                  <button
                    role="switch"
                    aria-label="同步生成音轨"
                    aria-checked={sound}
                    className={`switch ${sound ? "on" : ""}`}
                    disabled={
                      !model.audio ||
                      (model.providerId === "minimax" && model.kind === "video")
                    }
                    onClick={() => setSound(!sound)}
                  >
                    <span />
                  </button>
                </div>
              </>
            )}
            {audio && (
              <>
                <Field label="音色编号" hint="使用厂商控制台音色">
                  <input
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    placeholder="输入音色编号"
                  />
                </Field>
                <div className="voice-hint">
                  <AudioLines size={27} />
                  <strong>每一句，都值得被听见</strong>
                  <p>
                    支持中文及厂商提供的多语言音色，音色编号可在对应平台查询。
                  </p>
                </div>
              </>
            )}
            <div className="generation-bottom">
              <div className="quantity-row">
                <span>生成数量</span>
                <div className="stepper">
                  <button
                    aria-label="减少数量"
                    disabled={count === 1}
                    onClick={() => setCount(count - 1)}
                  >
                    −
                  </button>
                  <span>{count}</span>
                  <button
                    aria-label="增加数量"
                    disabled={count === 4}
                    onClick={() => setCount(count + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="estimate-box">
                <div>
                  <span>本次预计</span>
                  <strong>
                    <Money value={estimate} />
                  </strong>
                </div>
                <small>按 {model.verifiedAt} 价格快照估算</small>
                <small>
                  {model.providerId === "aliyun" && model.id === "wan3"
                    ? "含限时活动折扣 · 实际以厂商账单为准"
                    : "实际扣费以厂商账单为准"}
                </small>
              </div>
              <Button
                variant="primary"
                className="generate-btn"
                busy={busy}
                disabled={!prompt.trim() || !model.enabled}
                onClick={() => void submit()}
              >
                <Sparkles size={19} />
                {accountId ? "开始生成" : "绑定账户后生成"}
                <ArrowUpRight size={17} />
              </Button>
              <div className="budget-caption">
                <ShieldIcon />
                本站单次限额 <Money value={state.settings.perTaskLimit} />
              </div>
            </div>
          </section>
        </section>
        <div className="studio-result-column">
          <section className="panel preview-panel">
            <div className="panel-header">
              <h2>
                {audio ? <AudioLines size={17} /> : <Clapperboard size={17} />}{" "}
                {activeTask?.status === "succeeded" ? "生成结果" : "创作预览"}
              </h2>
              <div className="preview-badges">
                <Badge>
                  {activeTask?.input.resolution.toUpperCase() ||
                    resolution.toUpperCase()}
                </Badge>
                {!audio && (
                  <button
                    className="icon-btn"
                    aria-label="放大预览"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <Maximize2 size={16} />
                  </button>
                )}
              </div>
            </div>
            {activeTask?.resultDeletedAt ? (
              <div className="deleted-output">
                <Empty
                  icon={<Film size={30} />}
                  title="生成结果已删除"
                  description="提示词、参数和任务历史仍然保留，可载入后重新创作。"
                />
              </div>
            ) : audio ? (
              <div className="audio-preview">
                <div className="audio-orb">
                  <AudioLines size={45} />
                </div>
                <div className="waveform" aria-hidden="true">
                  {Array.from({ length: 48 }, (_, i) => (
                    <i
                      key={i}
                      style={{
                        height: `${15 + Math.abs(Math.sin(i * 1.7)) * 50}px`,
                      }}
                    />
                  ))}
                </div>
                {activeTask?.resultUrl ? (
                  <audio controls src={activeTask.resultUrl} />
                ) : (
                  <>
                    <h3>让你的故事，被听见。</h3>
                    <p>生成完成后，在这里试听和下载</p>
                  </>
                )}
              </div>
            ) : (
              <div className="video-preview">
                {activeTask?.resultUrl ? (
                  <video
                    key={activeTask.id}
                    controls
                    playsInline
                    src={activeTask.resultUrl}
                  />
                ) : (
                  <>
                    <img
                      src="/media/jellyfish.jpg"
                      alt="原型视觉参考：深海中的发光水母"
                    />
                    <div className="preview-shade" />
                    <span className="reference-watermark">
                      视觉参考 · 示例参考图
                    </span>
                    <div className="preview-copy">
                      <span className="eyebrow">
                        你的下一个镜头，从这里开始
                      </span>
                      <h2>深海之下，灵感之上。</h2>
                      <p>选择模型，写下想象，让第一个镜头从这里开始。</p>
                    </div>
                    <button
                      className="preview-play"
                      aria-label="查看视觉参考"
                      onClick={() => setPreviewOpen(true)}
                    >
                      <Play size={25} fill="currentColor" />
                    </button>
                    <div className="preview-timecode">
                      <span>Nova / 深海</span>
                      <span>参考画面</span>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="preview-toolbar">
              <span className="muted small">
                {activeTask
                  ? `${state.models.find((m) => m.id === activeTask.modelId)?.name} · ${statusLabels[activeTask.status]}`
                  : "生成结果仅对你可见"}
              </span>
              <div>
                {activeTask?.resultUrl && (
                  <a
                    className="btn btn-secondary"
                    href={activeTask.resultUrl}
                    download
                  >
                    <Download size={14} />
                    下载{audio ? "音频" : "视频"}
                  </a>
                )}
                <Button
                  variant="ghost"
                  disabled={!activeTask}
                  onClick={() => {
                    if (activeTask) {
                      setPrompt(activeTask.prompt);
                      setModelId(activeTask.modelId);
                      setResolution(activeTask.input.resolution);
                      notify("已载入此任务的提示词与模型");
                    }
                  }}
                >
                  <RefreshCw size={14} />
                  再次编辑
                </Button>
              </div>
            </div>
          </section>
          <section className="panel task-panel">
            <div className="panel-header">
              <h2>
                <Clock3 size={16} />
                任务与生成历史{" "}
                <span className="count-pill">{tasks.length}</span>
              </h2>
              <span className="small muted">自动同步</span>
            </div>
            {tasks.length ? (
              <div className="task-list">
                {tasks.slice(0, 8).map((task) => (
                  <div
                    className={`task-row ${activeTask?.id === task.id ? "task-selected" : ""}`}
                    key={task.id}
                  >
                    <button
                      className="task-main"
                      onClick={() => setActiveTaskId(task.id)}
                    >
                      <span className={`task-status task-${task.status}`}>
                        {task.status === "succeeded" ? (
                          <CheckCircle2 size={20} />
                        ) : ["failed", "unknown"].includes(task.status) ? (
                          <CircleAlert size={20} />
                        ) : task.status === "queued" ? (
                          <Clock3 size={20} />
                        ) : (
                          <LoaderCircle size={20} className="spin" />
                        )}
                      </span>
                      <span>
                        <strong>{task.prompt}</strong>
                        <small>
                          <span
                            className={
                              task.status === "succeeded" ? "green-text" : ""
                            }
                          >
                            {statusLabels[task.status]}
                          </span>{" "}
                          ·{" "}
                          {
                            state.models.find((m) => m.id === task.modelId)
                              ?.name
                          }{" "}
                          · <Money value={task.estimatedCost} /> 预估
                        </small>
                        {task.error && (
                          <small className="error-text">{task.error}</small>
                        )}
                      </span>
                    </button>
                    {["queued"].includes(task.status) ? (
                      <button
                        className="icon-btn"
                        title="取消排队"
                        aria-label="取消排队"
                        onClick={async () => {
                          try {
                            await api(`tasks/${task.id}/cancel`, {});
                            await refresh();
                            notify("已取消排队任务");
                          } catch (e) {
                            notify((e as Error).message, true);
                          }
                        }}
                      >
                        <X size={14} />
                      </button>
                    ) : ["processing", "unknown"].includes(task.status) ? (
                      <button
                        className="icon-btn"
                        title="查询任务状态"
                        aria-label="查询任务状态"
                        onClick={async () => {
                          try {
                            await api(`tasks/${task.id}/refresh`, {});
                            await refresh();
                          } catch (e) {
                            notify((e as Error).message, true);
                          }
                        }}
                      >
                        <RefreshCw size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                icon={<Film size={24} />}
                title="每一个好作品，都从第一次尝试开始"
                description="生成任务将在这里保留，随时回看提示词与参数。"
              />
            )}
          </section>
          <div className="studio-footnote">
            <span className="status-dot" />
            提示词与任务快照自动保存
            <ChevronRight size={12} />
            <Link href="/prompts">探索提示词库</Link>
          </div>
        </div>
      </div>
      <Modal
        open={variableOpen}
        onClose={() => setVariableOpen(false)}
        title="填写模板变量"
        description="填写后预览并载入完整提示词，不改变原始模板。"
      >
        <div className="modal-body">
          {vars.map((v) => (
            <Field key={v} label={`{{${v}}}`}>
              <input
                value={variables[v] || ""}
                onChange={(e) =>
                  setVariables({ ...variables, [v]: e.target.value })
                }
                placeholder={`填写${v}`}
              />
            </Field>
          ))}
          <div className="template-preview">
            {prompt.replace(
              /\{\{\s*([^{}]+?)\s*\}\}/g,
              (_, v: string) => variables[v.trim()] || `【${v.trim()}】`,
            )}
          </div>
        </div>
        <div className="modal-footer">
          <Button onClick={() => setVariableOpen(false)}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              try {
                setPrompt(renderTemplate(prompt, variables));
                setVariableOpen(false);
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            确认并载入
          </Button>
        </div>
      </Modal>
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="保存为提示词模板"
        description="保留本次创作文本与推荐模型，下一次直接套用。"
      >
        <div className="modal-body">
          <Field label="模板名称">
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="给这个灵感起个名字"
            />
          </Field>
        </div>
        <div className="modal-footer">
          <Button onClick={() => setSaveOpen(false)}>取消</Button>
          <Button
            variant="primary"
            disabled={!saveName.trim()}
            onClick={async () => {
              try {
                await api("prompts", {
                  name: saveName,
                  description: "从创作工作台保存",
                  content: prompt,
                  negativePrompt: negative,
                  modelId: model.id,
                  categoryId: "uncategorized",
                  tags: [],
                  cover: "/media/jellyfish.jpg",
                  defaults: {},
                });
                await refresh();
                setSaveOpen(false);
                setSaveName("");
                notify("已保存至提示词库");
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            保存模板
          </Button>
        </div>
      </Modal>
      <Modal
        open={optimizeOpen}
        onClose={() => setOptimizeOpen(false)}
        title="提示词优化"
        description="使用已绑定的 DeepSeek 服务优化文本；确认结果后才会替换原提示词。"
        wide
      >
        <div className="modal-body prompt-optimizer-body">
          {deepseekAccounts.length ? (
            <>
              {deepseekAccounts.length > 1 ? (
                <Field label="DeepSeek 账户">
                  <select
                    value={optimizeAccountId}
                    onChange={(e) => setOptimizeAccountId(e.target.value)}
                  >
                    {deepseekAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ·•••• {account.keyLast4}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div className="optimizer-account-pill">
                  <span>使用账户</span>
                  <strong>
                    {deepseekAccounts[0].name} ·•••• {deepseekAccounts[0].keyLast4}
                  </strong>
                </div>
              )}
              <div className="prompt-optimizer-notice">
                点击“发送并优化”后，下面的原文会发送至 DeepSeek，并按该账户的用量计费；该费用暂不计入本站费用中心。结果不会自动覆盖原文。
              </div>
              <Field label="本次发送的原提示词">
                <div className="prompt-optimizer-original">{prompt}</div>
              </Field>
              {optimizedPrompt && (
                <Field label="优化结果（可继续编辑）">
                  <textarea
                    rows={8}
                    value={optimizedPrompt}
                    onChange={(e) => setOptimizedPrompt(e.target.value)}
                    aria-label="优化结果"
                  />
                </Field>
              )}
              {optimizeError && (
                <div className="inline-error" role="alert">
                  {optimizeError}
                </div>
              )}
              <div className="modal-footer optimizer-footer">
                <Button onClick={() => setOptimizeOpen(false)}>取消</Button>
                {optimizedPrompt && (
                  <Button
                    variant="secondary"
                    onClick={() => void optimizePrompt()}
                    busy={optimizing}
                    disabled={!optimizeAccountId}
                  >
                    重新优化
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!optimizedPrompt) {
                      void optimizePrompt();
                      return;
                    }
                    setPrompt(optimizedPrompt);
                    setOptimizedPrompt("");
                    setOptimizeOpen(false);
                    notify("已替换为优化后的提示词");
                  }}
                  busy={optimizing}
                  disabled={!optimizeAccountId || !prompt.trim()}
                >
                  {optimizedPrompt ? "使用优化结果" : "发送并优化"}
                </Button>
              </div>
            </>
          ) : (
            <div className="prompt-optimizer-empty">
              <Sparkles size={24} />
              <strong>先绑定 DeepSeek 密钥</strong>
              <p>
                到“模型与密钥”添加 DeepSeek 账户。绑定成功后会自动返回，当前提示词会保留。
              </p>
              <Link
                className="btn btn-primary"
                href="/accounts?provider=deepseek"
                onClick={() => {
                  savePromptResume(sessionStorage, {
                    text: prompt,
                    kind: audio ? "audio" : "video",
                    ...(template ? { template } : {}),
                  });
                  sessionStorage.setItem(
                    "yingzao-optimizer-return-route",
                    audio ? "/audio" : "/video",
                  );
                }}
              >
                前往绑定并返回
                <ArrowUpRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={activeTask ? "生成结果" : "深海回响 · 视觉参考"}
        description={
          activeTask
            ? "本次任务的输出结果。"
            : "此图片来自设计原型，仅用于创作参考。"
        }
        wide
      >
        <div className="modal-body large-preview">
          {activeTask?.resultUrl ? (
            <video controls autoPlay src={activeTask.resultUrl} />
          ) : (
            <img src="/media/jellyfish.jpg" alt="深海水母视觉参考" />
          )}
        </div>
      </Modal>
    </div>
  );
}
function ShieldIcon() {
  return <span className="tiny-lock">◈</span>;
}
