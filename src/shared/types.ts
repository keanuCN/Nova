export type ProviderId =
  | "deepseek"
  | "volcengine"
  | "aliyun"
  | "minimax"
  | "runway"
  | "vidu"
  | "kling"
  | "google"
  | "elevenlabs"
  | "xai";
export type Mode = "text" | "image" | "reference";
export type MediaKind = "video" | "audio" | "image";
export interface Provider {
  id: ProviderId;
  name: string;
  english: string;
  color: string;
  initials: string;
  region: string;
  docsUrl: string;
  billingUrl: string;
  balanceKind: string;
  supported: boolean;
}
export interface Model {
  id: string;
  name: string;
  providerId: ProviderId;
  remoteId: string;
  kind: "video" | "audio";
  modes: Mode[];
  resolutions: string[];
  durations: number[];
  aspects: string[];
  rates: Record<string, number>;
  rateUnit: "second" | "character" | "song";
  currency: "CNY" | "USD";
  audio: boolean;
  negativePrompt: boolean;
  enabled: boolean;
  badge?: string;
  description: string;
  source: string;
  verifiedAt: string;
  voiceId?: string;
}
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  sort: number;
}
export interface PromptVersion {
  version: number;
  content: string;
  negativePrompt: string;
  updatedAt: string;
  name?: string;
}
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  negativePrompt: string;
  categoryId: string;
  tags: string[];
  modelId: string;
  cover: string;
  favorite: boolean;
  usageCount: number;
  version: number;
  versions: PromptVersion[];
  defaults: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface Account {
  id: string;
  providerId: ProviderId;
  name: string;
  region: string;
  keyLast4: string;
  enabled: boolean;
  budget: number;
  status: "untested" | "connected" | "error" | "disabled";
  lastError?: string;
  balance: {
    amount: number | null;
    unit: string;
    kind: string;
    updatedAt: string | null;
    note: string;
  };
  createdAt: string;
}
export interface Asset {
  id: string;
  name: string;
  kind: MediaKind;
  mime: string;
  size: number;
  url: string;
  projectId: string;
  createdAt: string;
  taskId?: string;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}
export interface TaskInput {
  modelId: string;
  accountId: string;
  projectId: string;
  prompt: string;
  negativePrompt: string;
  mode: Mode;
  duration: number;
  resolution: string;
  aspectRatio: string;
  audio: boolean;
  count: number;
  referenceAssetIds: string[];
  templateId?: string;
  templateVersion?: number;
  voiceId?: string;
}
export interface GenerationTask {
  id: string;
  modelId: string;
  accountId: string;
  projectId: string;
  prompt: string;
  negativePrompt: string;
  status:
    | "queued"
    | "submitting"
    | "processing"
    | "succeeded"
    | "failed"
    | "unknown"
    | "cancelled";
  kind: MediaKind;
  input: TaskInput;
  estimatedCost: number;
  actualCost: number | null;
  costStatus: "estimated" | "usage" | "confirmed" | "pending";
  remoteId: string | null;
  resultUrl: string | null;
  resultDeletedAt?: string;
  assetId?: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  priceSnapshot: unknown;
}
export interface Settings {
  monthlyBudget: number;
  perTaskLimit: number;
  dailyBudget: number;
  currencyRate: number;
  concurrency: number;
}
export interface StudioState {
  providers: Provider[];
  models: Model[];
  prompts: PromptTemplate[];
  categories: Category[];
  accounts: Account[];
  tasks: GenerationTask[];
  assets: Asset[];
  projects: Project[];
  settings: Settings;
}
