"use client";
import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  Star,
  Grid2X2,
  List,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Clapperboard,
  AudioLines,
  WandSparkles,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  X,
  Braces,
  ArrowUpRight,
  History,
  RotateCcw,
  Sparkles,
  Check,
  Bookmark,
  Filter,
} from "lucide-react";
import type { Category, PromptTemplate } from "@/shared/types";
import {
  categoryDescendants,
  extractVariables,
  renderTemplate,
} from "@/shared/domain";
import { Badge, Button, Empty, Field, Modal } from "./ui";
import type { PageProps } from "./studio";
export function PromptLibrary({
  state,
  api,
  refresh,
  notify,
  onApply,
}: PageProps & { onApply: (text: string, template: PromptTemplate) => void }) {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState(
    state.prompts.find((p) => !p.deletedAt)?.id || "",
  );
  const [editor, setEditor] = useState<Partial<PromptTemplate> | null>(null);
  const [editTags, setEditTags] = useState("");
  const [applying, setApplying] = useState<PromptTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [categoryEditor, setCategoryEditor] =
    useState<Partial<Category> | null>(null);
  const [tab, setTab] = useState<"detail" | "versions">("detail");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const visible = state.prompts.filter((p) =>
    category === "trash" ? !!p.deletedAt : !p.deletedAt,
  );
  const allTags = [...new Set(state.prompts.flatMap((p) => p.tags))];
  const filtered = visible.filter(
    (p) =>
      (category === "all" ||
        category === "trash" ||
        (category === "favorites" && p.favorite) ||
        categoryDescendants(state.categories, category).includes(
          p.categoryId,
        )) &&
      (!search ||
        `${p.name} ${p.description} ${p.content} ${p.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!tag || p.tags.includes(tag)) &&
      (!modelFilter || p.modelId === modelFilter),
  );
  const selected = filtered.find((p) => p.id === selectedId) || filtered[0];
  const currentName =
    category === "all"
      ? "全部提示词"
      : category === "favorites"
        ? "我的收藏"
        : category === "trash"
          ? "回收站"
          : state.categories.find((c) => c.id === category)?.name || "提示词";
  const openEditor = (p?: PromptTemplate) => {
    setEditor(
      p
        ? structuredClone(p)
        : {
            name: "",
            description: "",
            content: "",
            negativePrompt: "",
            categoryId:
              category !== "all" &&
              category !== "favorites" &&
              category !== "trash"
                ? category
                : "uncategorized",
            tags: [],
            modelId: "wan3",
            cover: "/media/perfume.jpg",
            defaults: {},
          },
    );
    setEditTags(p?.tags.join("，") || "");
  };
  const mutate = async (path: string, body: unknown, method?: string) => {
    try {
      await api(path, body, method);
      await refresh();
      return true;
    } catch (e) {
      notify((e as Error).message, true);
      return false;
    }
  };
  const favorite = async (p: PromptTemplate) => {
    await mutate(`prompts/${p.id}`, { favorite: !p.favorite }, "PATCH");
  };
  function exportPrompts() {
    const blob = new Blob(
      [
        JSON.stringify(
          filtered.map(
            ({ id, versions, createdAt, updatedAt, deletedAt, ...p }) => p,
          ),
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Nova-提示词模板.json";
    a.click();
    URL.revokeObjectURL(url);
    notify(`已导出 ${filtered.length} 个模板`);
  }
  async function importPrompts(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("模板文件不能超过 2 兆字节");
      const data = JSON.parse(await file.text());
      const items = Array.isArray(data) ? data : [data];
      if (items.length > 100) throw new Error("每次最多导入 100 个模板");
      let saved = 0;
      for (const p of items) {
        if (typeof p.name !== "string" || typeof p.content !== "string")
          throw new Error(
            `第 ${saved + 1} 个模板缺少名称或提示词，已导入 ${saved} 个`,
          );
        await api("prompts", {
          name: p.name,
          description: p.description || "",
          content: p.content,
          negativePrompt: p.negativePrompt || "",
          tags: Array.isArray(p.tags) ? p.tags : [],
          categoryId: state.categories.some((c) => c.id === p.categoryId)
            ? p.categoryId
            : "uncategorized",
          modelId: state.models.some((m) => m.id === p.modelId)
            ? p.modelId
            : "wan3",
          cover: [
            "/media/perfume.jpg",
            "/media/jellyfish.jpg",
            "/media/airlock.jpg",
            "/media/ocean.jpg",
          ].includes(p.cover)
            ? p.cover
            : "/media/perfume.jpg",
          defaults: p.defaults || {},
        });
        saved++;
      }
      await refresh();
      notify(`已导入 ${saved} 个模板`);
    } catch (e) {
      await refresh();
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  }
  return (
    <div className="library-page">
      <div className="page-titlebar">
        <div>
          <div className="eyebrow">沉淀你的创作语言</div>
          <h1>
            提示词资产库{" "}
            <span className="count-pill">
              {state.prompts.filter((p) => !p.deletedAt).length}
            </span>
          </h1>
          <p>把每一次好灵感，积累成下一次创作的起点。</p>
        </div>
        <div className="title-actions">
          <Button onClick={() => importRef.current?.click()} busy={busy}>
            <Upload size={15} />
            导入
          </Button>
          <Button onClick={exportPrompts}>
            <Download size={15} />
            导出
          </Button>
          <Button variant="primary" onClick={() => openEditor()}>
            <Plus size={17} />
            新建提示词
          </Button>
          <input
            hidden
            type="file"
            ref={importRef}
            accept="application/json,.json"
            onChange={(e) => void importPrompts(e.target.files?.[0])}
          />
        </div>
      </div>
      <div className="library-layout">
        <aside className="category-panel">
          <div className="category-panel-heading">
            <span>模板分类</span>
            <button
              className="icon-btn"
              title="新建分类"
              aria-label="新建分类"
              onClick={() => setCategoryEditor({ name: "", parentId: null })}
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            className={`category-special ${category === "all" ? "selected" : ""}`}
            onClick={() => setCategory("all")}
          >
            <Grid2X2 size={16} />
            全部提示词
            <span>{state.prompts.filter((p) => !p.deletedAt).length}</span>
          </button>
          <button
            className={`category-special ${category === "favorites" ? "selected" : ""}`}
            onClick={() => setCategory("favorites")}
          >
            <Star size={16} />
            我的收藏
            <span>
              {state.prompts.filter((p) => p.favorite && !p.deletedAt).length}
            </span>
          </button>
          <div className="category-divider" />
          {state.categories
            .filter((c) => !c.parentId)
            .sort((a, b) => a.sort - b.sort)
            .map((c) => (
              <CategoryBranch
                key={c.id}
                item={c}
                depth={0}
                categories={state.categories}
                prompts={state.prompts}
                selected={category}
                onSelect={setCategory}
                onEdit={setCategoryEditor}
              />
            ))}
          <div className="category-bottom">
            <button
              className={`category-special ${category === "trash" ? "selected" : ""}`}
              onClick={() => setCategory("trash")}
            >
              <Trash2 size={15} />
              回收站
              <span>{state.prompts.filter((p) => p.deletedAt).length}</span>
            </button>
            <div className="library-tip">
              <Braces size={20} />
              <strong>让提示词更灵活</strong>
              <p>使用 {"{{变量}}"}，为不同产品、场景或角色快速生成新版本。</p>
            </div>
          </div>
        </aside>
        <section className="library-main">
          <div className="library-toolbar">
            <div>
              <h2>{currentName}</h2>
              <span className="muted small">{filtered.length} 个模板</span>
            </div>
            <div className="view-toggle">
              <button
                aria-label="网格视图"
                className={layout === "grid" ? "active" : ""}
                onClick={() => setLayout("grid")}
              >
                <Grid2X2 size={16} />
              </button>
              <button
                aria-label="列表视图"
                className={layout === "list" ? "active" : ""}
                onClick={() => setLayout("list")}
              >
                <List size={17} />
              </button>
            </div>
          </div>
          <div className="filter-bar">
            <div className="search-field">
              <Search size={15} />
              <input
                aria-label="搜索提示词"
                placeholder="搜索名称、提示词或标签…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="按模型筛选"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            >
              <option value="">全部模型</option>
              {state.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="tag-filters">
            <button
              className={!tag ? "selected" : ""}
              onClick={() => setTag("")}
            >
              全部标签
            </button>
            {allTags.slice(0, 9).map((t) => (
              <button
                className={tag === t ? "selected" : ""}
                key={t}
                onClick={() => setTag(tag === t ? "" : t)}
              >
                {t}
              </button>
            ))}
          </div>
          {filtered.length ? (
            <div className={`prompt-collection prompt-${layout}`}>
              {filtered.map((p) => (
                <article
                  className={`prompt-card ${selected?.id === p.id ? "prompt-card-selected" : ""}`}
                  key={p.id}
                >
                  <button
                    className="prompt-cover"
                    onClick={() => {
                      setSelectedId(p.id);
                      setTab("detail");
                    }}
                  >
                    <img
                      src={p.cover || "/media/perfume.jpg"}
                      alt={p.name}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = "/media/perfume.jpg";
                      }}
                    />
                    <span className="cover-overlay" />
                    <span className="cover-category">
                      <Clapperboard size={11} />
                      {state.categories.find((c) => c.id === p.categoryId)
                        ?.name || "未分类"}
                    </span>
                    <span className="cover-version">版本 {p.version}</span>
                  </button>
                  <button
                    aria-label={p.favorite ? "取消收藏" : "收藏模板"}
                    className={`favorite-button ${p.favorite ? "is-favorite" : ""}`}
                    onClick={() => void favorite(p)}
                  >
                    <Star
                      size={15}
                      fill={p.favorite ? "currentColor" : "none"}
                    />
                  </button>
                  <div className="prompt-card-content">
                    <button
                      className="prompt-card-title"
                      onClick={() => {
                        setSelectedId(p.id);
                        setTab("detail");
                      }}
                    >
                      {p.name}
                    </button>
                    <p>{p.description}</p>
                    <div className="prompt-tags">
                      {p.tags.slice(0, 3).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                    <div className="prompt-card-footer">
                      <span>
                        {state.models.find((m) => m.id === p.modelId)?.name ||
                          "通用模板"}
                      </span>
                      <button
                        onClick={() => {
                          setApplying(p);
                          setVariables({ ...p.defaults });
                        }}
                      >
                        <WandSparkles size={13} />
                        套用
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Search size={26} />}
              title={
                category === "trash" ? "回收站空空如也" : "没有找到匹配的模板"
              }
              description="调整分类或筛选条件，或者保存一个新的创作灵感。"
              action={
                <Button onClick={() => openEditor()}>
                  <Plus size={15} />
                  新建提示词
                </Button>
              }
            />
          )}
          <div className="collection-footer">
            <span>已显示 {filtered.length} 个模板</span>
            <span>灵感会消失，好的提示词不会。</span>
          </div>
        </section>
        {selected && (
          <aside className="prompt-inspector">
            <div className="inspector-cover">
              <img
                src={selected.cover || "/media/perfume.jpg"}
                alt={selected.name}
                onError={(e) => {
                  e.currentTarget.src = "/media/perfume.jpg";
                }}
              />
              <div />
              <Badge tone="green">提示词模板</Badge>
            </div>
            <div className="inspector-heading">
              <h2>{selected.name}</h2>
              <p>{selected.description}</p>
              <div className="inspector-actions">
                <Button variant="ghost" onClick={() => openEditor(selected)}>
                  <Pencil size={14} />
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await mutate("prompts", {
                        ...selected,
                        id: undefined,
                        name: `${selected.name} · 副本`,
                        versions: [],
                        favorite: false,
                      })
                    ) {
                      notify("已复制模板");
                    }
                  }}
                >
                  <Copy size={14} />
                  复制
                </Button>
                {selected.deletedAt ? (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (await mutate(`prompts/${selected.id}/restore`, {}))
                        notify("模板已恢复");
                    }}
                  >
                    <RotateCcw size={14} />
                    恢复
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setDeleteTarget(selected)}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>
            <div className="inspector-tabs">
              <button
                className={tab === "detail" ? "active" : ""}
                onClick={() => setTab("detail")}
              >
                模板详情
              </button>
              <button
                className={tab === "versions" ? "active" : ""}
                onClick={() => setTab("versions")}
              >
                <History size={13} />
                版本记录 <span>{selected.versions.length + 1}</span>
              </button>
            </div>
            <div className="inspector-scroll">
              {tab === "detail" ? (
                <>
                  <div className="section-label">
                    提示词正文 <span className="mono">版本 {selected.version}</span>
                  </div>
                  <div className="prompt-source">
                    {selected.content
                      .split(/(\{\{[^{}]+\}\})/g)
                      .map((part, i) =>
                        part.startsWith("{{") ? (
                          <mark key={i}>{part}</mark>
                        ) : (
                          <span key={i}>{part}</span>
                        ),
                      )}
                  </div>
                  {extractVariables(selected.content).length > 0 && (
                    <>
                      <div className="section-label">
                        动态变量 <Braces size={13} />
                      </div>
                      <div className="variable-chips">
                        {extractVariables(selected.content).map((v) => (
                          <span key={v}>{`{{${v}}}`}</span>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="section-label">标签</div>
                  <div className="prompt-tags">
                    {selected.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  <dl className="template-meta">
                    <div>
                      <dt>推荐模型</dt>
                      <dd>
                        {
                          state.models.find((m) => m.id === selected.modelId)
                            ?.name
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>使用次数</dt>
                      <dd>{selected.usageCount} 次</dd>
                    </div>
                    <div>
                      <dt>最近修改</dt>
                      <dd>
                        {new Date(selected.updatedAt).toLocaleDateString(
                          "zh-CN",
                        )}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  <div className="version-entry">
                    <Badge tone="green">当前版本 {selected.version}</Badge>
                    <small>
                      {new Date(selected.updatedAt).toLocaleString("zh-CN")}
                    </small>
                  </div>
                  {[...selected.versions].reverse().map((v) => (
                    <div className="version-entry" key={v.version}>
                      <strong>版本 {v.version}</strong>
                      <small>
                        {new Date(v.updatedAt).toLocaleString("zh-CN")}
                      </small>
                      <p>{v.content}</p>
                      <Button
                        onClick={async () => {
                          if (
                            await mutate(`prompts/${selected.id}/rollback`, {
                              version: v.version,
                            })
                          )
                            notify("已恢复为历史内容，并创建新版本");
                        }}
                      >
                        <RotateCcw size={13} />
                        恢复此版本
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="inspector-bottom">
              <Button
                variant="primary"
                disabled={!!selected.deletedAt}
                onClick={() => {
                  setApplying(selected);
                  setVariables({ ...selected.defaults });
                }}
              >
                <WandSparkles size={16} />
                一键套用模板
                <ArrowUpRight size={16} />
              </Button>
            </div>
          </aside>
        )}
      </div>
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.id ? "编辑提示词" : "新建提示词"}
        description="保存可复用的创作语言，使用双花括号定义变量。"
        wide
      >
        {editor && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const payload = {
                ...editor,
                tags: editTags
                  .split(/[,，]/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              };
              try {
                const result = await api<PromptTemplate>(
                  editor.id ? `prompts/${editor.id}` : "prompts",
                  payload,
                  editor.id ? "PATCH" : "POST",
                );
                setSelectedId(result.id);
                await refresh();
                setEditor(null);
                notify("提示词已保存");
              } catch (e) {
                notify((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="modal-body">
              <div className="form-grid">
                <Field label="模板名称">
                  <input
                    required
                    maxLength={100}
                    value={editor.name || ""}
                    onChange={(e) =>
                      setEditor({ ...editor, name: e.target.value })
                    }
                    placeholder="例如：高端香氛 · 水下微距"
                  />
                </Field>
                <Field label="所属分类">
                  <select
                    value={editor.categoryId || "uncategorized"}
                    onChange={(e) =>
                      setEditor({ ...editor, categoryId: e.target.value })
                    }
                  >
                    {state.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryPath(state.categories, c.id)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="一句话说明">
                <input
                  value={editor.description || ""}
                  onChange={(e) =>
                    setEditor({ ...editor, description: e.target.value })
                  }
                  placeholder="这个模板适合什么场景？"
                />
              </Field>
              <Field label="提示词正文" hint="支持 {{变量名称}}">
                <textarea
                  required
                  rows={7}
                  maxLength={10000}
                  value={editor.content || ""}
                  onChange={(e) =>
                    setEditor({ ...editor, content: e.target.value })
                  }
                  placeholder="描述主体、场景、镜头和声音…"
                />
              </Field>
              <div className="form-grid">
                <Field label="推荐模型">
                  <select
                    value={editor.modelId || "wan3"}
                    onChange={(e) =>
                      setEditor({ ...editor, modelId: e.target.value })
                    }
                  >
                    {state.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="标签" hint="使用逗号分隔">
                  <input
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="电商，微距，电影感"
                  />
                </Field>
              </div>
              {extractVariables(editor.content || "").length > 0 && (
                <>
                  <div className="section-label">变量默认值</div>
                  <div className="form-grid">
                    {extractVariables(editor.content || "").map((v) => (
                      <Field key={v} label={v}>
                        <input
                          value={editor.defaults?.[v] || ""}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              defaults: {
                                ...editor.defaults,
                                [v]: e.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <Button type="button" onClick={() => setEditor(null)}>
                取消
              </Button>
              <Button type="submit" variant="primary" busy={busy}>
                <Check size={16} />
                保存提示词
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!applying}
        onClose={() => setApplying(null)}
        title={`套用模板 · ${applying?.name || ""}`}
        description="填写变量，预览完整提示词后载入创作工作台。"
        wide
      >
        {applying && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const text = renderTemplate(applying.content, variables);
                onApply(text, applying);
                setApplying(null);
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            <div className="modal-body">
              <div className="form-grid">
                {extractVariables(applying.content).map((v) => (
                  <Field key={v} label={`{{${v}}}`}>
                    <input
                      required
                      value={variables[v] || ""}
                      onChange={(e) =>
                        setVariables({ ...variables, [v]: e.target.value })
                      }
                      placeholder={`填写${v}`}
                    />
                  </Field>
                ))}
              </div>
              <div className="section-label">
                <span>
                  <Braces size={14} />
                  实时预览
                </span>
                <Badge tone="green">自动同步</Badge>
              </div>
              <div className="template-preview">
                {applying.content
                  .split(/(\{\{\s*[^{}]+\s*\}\})/g)
                  .map((part, i) =>
                    part.startsWith("{{") ? (
                      <mark key={i}>
                        {variables[part.slice(2, -2).trim()] || part}
                      </mark>
                    ) : (
                      <span key={i}>{part}</span>
                    ),
                  )}
              </div>
            </div>
            <div className="modal-footer">
              <span className="small muted">保留原始模板 · 本次使用副本</span>
              <Button type="button" onClick={() => setApplying(null)}>
                取消
              </Button>
              <Button variant="primary" type="submit">
                <WandSparkles size={16} />
                确认并载入工作台
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!categoryEditor}
        onClose={() => setCategoryEditor(null)}
        title={categoryEditor?.id ? "管理分类" : "新建分类"}
        description="最多三级，可按媒介、用途与场景组织。"
      >
        {categoryEditor && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate(
                  categoryEditor.id
                    ? `categories/${categoryEditor.id}`
                    : "categories",
                  categoryEditor,
                  categoryEditor.id ? "PATCH" : "POST",
                )
              ) {
                setCategoryEditor(null);
                notify("分类已保存");
              }
            }}
          >
            <div className="modal-body">
              <Field label="分类名称">
                <input
                  required
                  maxLength={40}
                  value={categoryEditor.name || ""}
                  onChange={(e) =>
                    setCategoryEditor({
                      ...categoryEditor,
                      name: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="上级分类">
                <select
                  value={categoryEditor.parentId || ""}
                  onChange={(e) =>
                    setCategoryEditor({
                      ...categoryEditor,
                      parentId: e.target.value || null,
                    })
                  }
                >
                  <option value="">无 · 一级分类</option>
                  {state.categories
                    .filter(
                      (c) =>
                        !categoryEditor.id ||
                        !categoryDescendants(
                          state.categories,
                          categoryEditor.id,
                        ).includes(c.id),
                    )
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {categoryPath(state.categories, c.id)}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <div className="modal-footer">
              {categoryEditor.id && categoryEditor.id !== "uncategorized" && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={async () => {
                    if (
                      await mutate(
                        `categories/${categoryEditor.id}`,
                        {},
                        "DELETE",
                      )
                    ) {
                      setCategoryEditor(null);
                      setCategory("all");
                      notify("分类已删除，模板已移至未分类");
                    }
                  }}
                >
                  删除分类
                </Button>
              )}
              <Button type="button" onClick={() => setCategoryEditor(null)}>
                取消
              </Button>
              <Button type="submit" variant="primary">
                保存分类
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="移入回收站？"
        description={`“${deleteTarget?.name || ""}”可以随时从回收站恢复，历史任务不受影响。`}
      >
        <div className="modal-footer">
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (
                deleteTarget &&
                (await mutate(`prompts/${deleteTarget.id}`, {}, "DELETE"))
              ) {
                setDeleteTarget(null);
                setSelectedId("");
                notify("已移入回收站");
              }
            }}
          >
            移入回收站
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function categoryPath(categories: Category[], id: string): string {
  const parts: string[] = [];
  let c = categories.find((x) => x.id === id);
  const seen = new Set<string>();
  while (c && !seen.has(c.id)) {
    seen.add(c.id);
    parts.unshift(c.name);
    c = categories.find((x) => x.id === c?.parentId);
  }
  return parts.join(" / ");
}
function CategoryBranch({
  item,
  depth,
  categories,
  prompts,
  selected,
  onSelect,
  onEdit,
}: {
  item: Category;
  depth: number;
  categories: Category[];
  prompts: PromptTemplate[];
  selected: string;
  onSelect: (id: string) => void;
  onEdit: (c: Category) => void;
}) {
  const [open, setOpen] = useState(true);
  const children = categories
    .filter((c) => c.parentId === item.id)
    .sort((a, b) => a.sort - b.sort);
  const ids = categoryDescendants(categories, item.id);
  const count = prompts.filter(
    (p) => !p.deletedAt && ids.includes(p.categoryId),
  ).length;
  return (
    <div className="category-branch">
      <div
        className={`category-row ${selected === item.id ? "selected" : ""}`}
        style={{ paddingLeft: 10 + depth * 15 }}
      >
        {children.length ? (
          <button
            className="category-expand"
            aria-label={`展开或折叠${item.name}`}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="category-leaf" />
        )}
        <button className="category-select" onClick={() => onSelect(item.id)}>
          {depth === 0 ? (
            <FolderOpen size={15} />
          ) : depth === 1 ? (
            <Folder size={13} />
          ) : null}
          <span>{item.name}</span>
          <small>{count}</small>
        </button>
        {item.id !== "uncategorized" && (
          <button
            className="category-edit"
            aria-label={`编辑分类${item.name}`}
            onClick={() => onEdit(item)}
          >
            <Pencil size={11} />
          </button>
        )}
      </div>
      {open &&
        children.map((c) => (
          <CategoryBranch
            key={c.id}
            item={c}
            depth={depth + 1}
            categories={categories}
            prompts={prompts}
            selected={selected}
            onSelect={onSelect}
            onEdit={onEdit}
          />
        ))}
    </div>
  );
}
