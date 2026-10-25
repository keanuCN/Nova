"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Aperture,
  Clapperboard,
  KeyRound,
  WandSparkles,
  AudioLines,
  FolderOpen,
  ReceiptText,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Plus,
  ArrowUpRight,
  ChevronDown,
  LoaderCircle,
  LogOut,
  Settings2,
  ShieldCheck,
  Command,
  X,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { StudioState, PromptTemplate } from "@/shared/types";
import { saveDraft } from "@/shared/transfer";
import { Button, Toast, Badge } from "./ui";
import { VideoStudio } from "./video-studio";
import { PromptLibrary } from "./prompt-library";
import { AccountsPage } from "./accounts-page";
import { AssetsPage, BillingPage, SettingsPage } from "./workspace-pages";
export type Api = <T = unknown>(
  path: string,
  body?: unknown,
  method?: string,
) => Promise<T>;
export interface PageProps {
  state: StudioState;
  refresh: () => Promise<void>;
  api: Api;
  notify: (message: string, error?: boolean) => void;
}
const nav = [
  { id: "video", name: "视频生成", icon: Clapperboard },
  { id: "audio", name: "音频生成", icon: AudioLines },
  { id: "prompts", name: "提示词库", icon: WandSparkles },
  { id: "assets", name: "项目素材", icon: FolderOpen },
  { id: "accounts", name: "模型与密钥", icon: KeyRound },
  { id: "billing", name: "费用中心", icon: ReceiptText },
];
const titles: Record<string, string> = {
  video: "视频创作",
  audio: "音频创作",
  prompts: "提示词资产库",
  assets: "项目素材",
  accounts: "模型与密钥",
  billing: "费用中心",
  settings: "工作台设置",
};
export function Studio({ initialPage }: { initialPage: string }) {
  const router = useRouter();
  const page = titles[initialPage] ? initialPage : "video";
  const [auth, setAuth] = useState<{
    setupRequired: boolean;
    authenticated: boolean;
  } | null>(null);
  const [state, setState] = useState<StudioState | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectId, setProjectId] = useState("default");
  const [projectOpen, setProjectOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<{
    text: string;
    template: PromptTemplate;
  } | null>(null);
  const [fatal, setFatal] = useState("");
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const api = useCallback<Api>(
    async <T,>(path: string, body?: unknown, method?: string): Promise<T> => {
      const form = body instanceof FormData;
      const response = await fetch(`/api/${path}`, {
        method: method || (body === undefined ? "GET" : "POST"),
        headers: form
          ? {}
          : body === undefined
            ? {}
            : { "Content-Type": "application/json" },
        body:
          body === undefined ? undefined : form ? body : JSON.stringify(body),
      });
      if (response.status === 401) {
        setAuth((a) => (a ? { ...a, authenticated: false } : null));
        setState(null);
      }
      const data = await response
        .json()
        .catch(() => ({ error: "服务返回了无法识别的数据" }));
      if (!response.ok)
        throw new Error(data.error || data.message || "操作失败，请重试");
      return data as T;
    },
    [],
  );
  const refresh = useCallback(async () => {
    try {
      setState(await api<StudioState>("state"));
      setFatal("");
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "读取失败");
    }
  }, [api]);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then(setAuth)
      .catch(() => setFatal("暂时无法连接本地服务"));
  }, []);
  useEffect(() => {
    if (auth?.authenticated) void refresh();
  }, [auth, refresh]);
  useEffect(() => {
    if (!auth?.authenticated) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 6000);
    return () => clearInterval(id);
  }, [auth, refresh]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setProjectOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const onApply = (text: string, template: PromptTemplate) => {
    saveDraft(sessionStorage, { text, template });
    setTemplateDraft({ text, template });
    router.push(
      template.modelId.startsWith("speech") ||
        template.modelId.startsWith("eleven")
        ? "/audio"
        : "/video",
    );
  };
  if (!auth)
    return (
      <div className="boot">
        <Aperture size={32} />
        <span>{fatal || "正在打开你的创作空间"}…</span>
      </div>
    );
  if (!auth.authenticated)
    return (
      <>
        <AuthScreen
          setup={auth.setupRequired}
          api={api}
          onReady={() => setAuth({ setupRequired: false, authenticated: true })}
        />
        {toast && <Toast {...toast} />}
      </>
    );
  if (!state)
    return (
      <div className="boot">
        <LoaderCircle className="spin" />
        <span>{fatal || "正在读取工作台…"}</span>
        {fatal && <Button onClick={() => void refresh()}>重新连接</Button>}
      </div>
    );
  const props: PageProps = { state, refresh, api, notify };
  const running = state.tasks.filter((t) =>
    ["queued", "submitting", "processing"].includes(t.status),
  ).length;
  const enabled = state.accounts.filter((a) => a.enabled).length;
  const selectedProject =
    state.projects.find((p) => p.id === projectId) || state.projects[0];
  const searchPrompts = state.prompts
    .filter(
      (p) =>
        !p.deletedAt &&
        `${p.name} ${p.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .slice(0, 6);
  return (
    <div className={`app ${collapsed ? "app-collapsed" : ""}`}>
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <Link className="brand" href="/video">
          <span className="brand-icon">
            <Aperture size={25} />
          </span>
          <span className="brand-copy">
            <strong>
              Nova <b>本地版</b>
            </strong>
            <small>专属创作工作台</small>
          </span>
        </Link>
        <div className="nav-section-label">创作空间</div>
        <nav>
          {nav.map(({ id, name, icon: Icon }) => (
            <Link
              title={name}
              key={id}
              href={`/${id}`}
              onClick={() => setMobileNav(false)}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{name}</span>
              {id === "prompts" && (
                <small>
                  {state.prompts.filter((p) => !p.deletedAt).length}
                </small>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-project">
          <div className="nav-section-label">你的项目</div>
          {state.projects.slice(0, 4).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProjectId(p.id);
                router.push("/assets");
              }}
            >
              <span
                className={`project-dot ${projectId === p.id ? "selected" : ""}`}
              />
              <span>{p.name}</span>
            </button>
          ))}
          <button
            className="new-project"
            onClick={() => router.push("/assets?new=1")}
          >
            <Plus size={14} />
            <span>新建项目</span>
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className="status-dot" />
            <span>本地私有工作台</span>
            <ShieldCheck size={14} />
          </div>
          <Link
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            href="/settings"
          >
            <Settings2 size={18} />
            <span>设置与偏好</span>
          </Link>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
            <span>折叠工作台</span>
            <kbd>⌘ \</kbd>
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="展开导航"
            onClick={() => setMobileNav(true)}
          >
            <PanelLeftOpen size={20} />
          </button>
          <div className="project-switch">
            <button
              className="project-select"
              onClick={() => setProjectOpen(!projectOpen)}
            >
              <span className="status-dot" />
              <span>{selectedProject?.name || "我的创作空间"}</span>
              <ChevronDown size={14} />
            </button>
            {projectOpen && (
              <div className="project-menu">
                {state.projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setProjectId(p.id);
                      setProjectOpen(false);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="global-search" onClick={() => setSearchOpen(true)}>
            <Search size={15} />
            <span>搜索提示词、素材或模型…</span>
            <kbd>快捷搜索</kbd>
          </button>
          <div className="topbar-right">
            <Link href="/assets" className="queue-indicator">
              <span className={running ? "status-dot pulse" : "muted-dot"} />
              <span>
                {running ? `${running} 个任务进行中` : "任务队列空闲"}
              </span>
            </Link>
            <div className="topbar-separator" />
            <button
              className="profile-button"
              title="账户设置"
              onClick={() => router.push("/settings")}
            >
              <span className="avatar">我</span>
              <span>
                创作者<small>个人工作空间</small>
              </span>
            </button>
          </div>
        </header>
        <main className="main-content">
          {page === "video" || page === "audio" ? (
            <VideoStudio
              key={page}
              {...props}
              audio={page === "audio"}
              projectId={projectId}
              draft={templateDraft}
              clearDraft={() => setTemplateDraft(null)}
              onChooseTemplate={() => router.push("/prompts")}
            />
          ) : page === "prompts" ? (
            <PromptLibrary {...props} onApply={onApply} />
          ) : page === "accounts" ? (
            <AccountsPage {...props} />
          ) : page === "assets" ? (
            <AssetsPage
              {...props}
              projectId={projectId}
              setProjectId={setProjectId}
            />
          ) : page === "billing" ? (
            <BillingPage {...props} />
          ) : (
            <SettingsPage
              {...props}
              logout={async () => {
                await api("auth/logout", {});
                setAuth({ setupRequired: false, authenticated: false });
                setState(null);
              }}
            />
          )}
        </main>
        <footer className="statusbar">
          <span>
            <span className="status-dot" />
            本地存储已连接
          </span>
          <span>
            {enabled} 个已启用账户<span className="status-divider">/</span>
            价格快照 2026.10.24
          </span>
          <span>
            Nova <small>版本 0.1</small>
          </span>
        </footer>
      </div>
      {searchOpen && (
        <div className="command-overlay" onClick={() => setSearchOpen(false)}>
          <div className="command-panel" onClick={(e) => e.stopPropagation()}>
            <div className="command-input">
              <Search size={19} />
              <input
                autoFocus
                placeholder="搜索模板名称、标签或页面…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="icon-btn"
                aria-label="关闭搜索"
                onClick={() => setSearchOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="command-results">
              <div className="eyebrow">提示词模板</div>
              {searchPrompts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onApply(p.content, p);
                    setSearchOpen(false);
                  }}
                >
                  <WandSparkles size={17} />
                  <span>
                    {p.name}
                    <small>{p.tags.join(" · ")}</small>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
              <div className="eyebrow">导航</div>
              {nav
                .filter((n) => !search || n.name.includes(search))
                .map(({ id, name, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => {
                      router.push(`/${id}`);
                      setSearchOpen(false);
                    }}
                  >
                    <Icon size={17} />
                    {name}
                    <ArrowRight size={15} />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {toast && <Toast {...toast} />}
    </div>
  );
}
function AuthScreen({
  setup,
  api,
  onReady,
}: {
  setup: boolean;
  api: Api;
  onReady: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="auth-page">
      <div
        className="auth-art"
        style={{ backgroundImage: "url(/media/jellyfish.jpg)" }}
      >
        <div className="auth-art-overlay" />
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Aperture size={24} />
          </span>
          <span className="brand-copy">
            <strong>Nova</strong>
            <small>让灵感动起来</small>
          </span>
        </Link>
        <div className="auth-caption">
          <div className="eyebrow">开启下一段灵感</div>
          <h1>
            让每一个灵感，
            <br />
            都有自己的镜头。
          </h1>
          <p>连接世界的模型，建立属于你的创作语言。</p>
          <div className="auth-tags">
            <Badge>多模型创作</Badge>
            <Badge>提示词资产库</Badge>
            <Badge>私有工作空间</Badge>
          </div>
        </div>
        <small className="art-caption">深海回响 / 原型视觉参考</small>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <span className="auth-icon">
            <Sparkles size={26} />
          </span>
          <div className="eyebrow">欢迎来到 Nova</div>
          <h2>{setup ? "建立你的创作空间" : "欢迎回到 Nova"}</h2>
          <p>
            {setup
              ? "设置工作台密码，保护你的接口凭据与创作资产。"
              : "输入密码，继续上一次的灵感。"}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (setup && password !== confirm) {
                setError("两次输入的密码不一致");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await api(setup ? "auth/setup" : "auth/login", { password });
                onReady();
              } catch (e) {
                setError(e instanceof Error ? e.message : "登录失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>{setup ? "设置密码" : "工作台密码"}</span>
              <input
                type="password"
                minLength={setup ? 10 : 1}
                required
                autoComplete={setup ? "new-password" : "current-password"}
                placeholder={setup ? "至少 10 个字符" : "输入你的密码"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {setup && (
              <label className="field">
                <span>确认密码</span>
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" variant="primary" busy={busy}>
              {setup ? "创建并进入工作台" : "进入创作空间"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-note">
            <ShieldCheck size={16} />
            <span>凭据在服务端加密保存，工作空间仅属于你。</span>
          </div>
        </div>
        <div className="auth-footer">Nova · 本地私有版</div>
      </div>
    </div>
  );
}
