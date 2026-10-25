import type { Category, Project, PromptTemplate, Settings } from "./types";
export const defaultSettings: Settings = {
  monthlyBudget: 2000,
  dailyBudget: 200,
  perTaskLimit: 50,
  currencyRate: 7.2,
  concurrency: 2,
};
export const initialCategories: Category[] = [
  { id: "uncategorized", name: "未分类", parentId: null, sort: 99 },
  { id: "video", name: "视频生成模板", parentId: null, sort: 0 },
  { id: "commerce", name: "电商广告", parentId: "video", sort: 0 },
  { id: "product", name: "商品展示微距", parentId: "commerce", sort: 0 },
  { id: "fashion", name: "模特动态走秀", parentId: "commerce", sort: 1 },
  { id: "cinema", name: "短剧与影视", parentId: "video", sort: 1 },
  { id: "scifi", name: "科幻场景", parentId: "cinema", sort: 0 },
  { id: "dialogue", name: "人物近景对白", parentId: "cinema", sort: 1 },
  { id: "nature", name: "自然与纪录", parentId: "video", sort: 2 },
  { id: "ocean", name: "深海微观", parentId: "nature", sort: 0 },
  { id: "audio", name: "音频生成模板", parentId: null, sort: 1 },
  { id: "voice", name: "旁白与配音", parentId: "audio", sort: 0 },
  { id: "narration", name: "知识讲解", parentId: "voice", sort: 0 },
  { id: "music", name: "氛围与音效", parentId: "audio", sort: 1 },
];
export const initialProjects: Project[] = [
  {
    id: "default",
    name: "我的创作空间",
    description: "从一个灵感，开始你的下一部作品。",
    createdAt: "2026-10-24T00:00:00.000Z",
  },
];
const defs: Omit<
  PromptTemplate,
  | "negativePrompt"
  | "usageCount"
  | "version"
  | "versions"
  | "createdAt"
  | "updatedAt"
  | "deletedAt"
>[] = [
  {
    id: "ocean-film",
    name: "深海回响 · 生物荧光",
    description: "水下微距与体积光，探索深海的静谧叙事。",
    categoryId: "ocean",
    tags: ["纪录片", "深海", "微距", "电影感"],
    cover: "/media/jellyfish.jpg",
    content:
      "电影级微距镜头，{{主体}} 在墨蓝色的深渊中缓缓起伏，触须呈现青绿色半透明生物荧光，水体中有细腻的浮游粒子与丁达尔光线。{{运镜方式}}，浅景深，自然流畅的运动，安静而神秘的氛围。",
    defaults: { 主体: "深海发光水母", 运镜方式: "缓慢推进并轻微环绕" },
    modelId: "wan3",
    favorite: true,
  },
  {
    id: "perfume",
    name: "高端香氛 · 水下微距",
    description: "用光影与材质，为产品建立独特的感官记忆。",
    categoryId: "product",
    tags: ["电商", "香水", "写实", "微距"],
    cover: "/media/perfume.jpg",
    content:
      "极简深色背景，极致微距电影镜头。奢华哑光玻璃质感的 {{产品名称}} 静置于黑色深邃湖水中央，周围漂浮着 {{环境元素}} 与晶莹液滴。摄影机以 {{运镜方式}} 极慢速环绕下沉，整体呈现 {{视觉色调}}，高级商业广告光影质感。",
    defaults: {
      产品名称: "极光曜黑琉璃香水",
      环境元素: "玫瑰花瓣与黑曜石结晶",
      运镜方式: "从上至下俯视缓慢推进",
      视觉色调: "石墨暗黑配合青翠幽光",
    },
    modelId: "seedance25",
    favorite: true,
  },
  {
    id: "airlock",
    name: "深空回响 · 舱门开启",
    description: "工业机械与光线碰撞，营造宇宙探索的临场感。",
    categoryId: "scifi",
    tags: ["科幻", "机械", "电影感"],
    cover: "/media/airlock.jpg",
    content:
      "一座巨大的太空站，{{主体}} 缓缓打开，蒸汽从金属结构间释放。橙色警示灯映照在冰冷的金属表面，{{运镜方式}}，真实机械运动，细腻的磨损质感与体积光。",
    defaults: { 主体: "重型气闸舱门", 运镜方式: "低角度缓慢推进" },
    modelId: "gen45",
    favorite: false,
  },
  {
    id: "fashion-film",
    name: "城市漫游 · 时装叙事",
    description: "自然步态与城市留白，让穿搭成为故事的主角。",
    categoryId: "fashion",
    tags: ["时尚", "人像", "街拍"],
    cover: "/media/watch.jpg",
    content:
      "{{人物}} 穿着 {{服装}} 行走在清晨的城市街道，柔和侧逆光，摄影机平行跟拍，自然的步态，真实的衣料运动，低饱和电影调色。",
    defaults: { 人物: "一位年轻女性", 服装: "米白色风衣" },
    modelId: "wan3",
    favorite: false,
  },
  {
    id: "narrator",
    name: "自然纪录 · 温柔旁白",
    description: "适合知识短片与自然纪录的简洁旁白文本。",
    categoryId: "narration",
    tags: ["配音", "中文", "纪录片"],
    cover: "/media/ocean.jpg",
    content:
      "在 {{地点}}，每一次细微的变化，都藏着生命的答案。{{主题描述}}。让我们放慢脚步，听见自然的声音。",
    defaults: {
      地点: "阳光尚未抵达的深海",
      主题描述: "光，是这里最温柔的语言",
    },
    modelId: "speech-turbo",
    favorite: false,
  },
  {
    id: "dialogue-film",
    name: "窗边独白 · 情绪近景",
    description: "克制的情绪、真实的眼神，留下人物的呼吸感。",
    categoryId: "dialogue",
    tags: ["人物", "对白", "情绪"],
    cover: "/media/mountain.jpg",
    content:
      "{{人物}} 坐在窗边，午后柔和的光照亮侧脸，轻声说出：“{{台词}}”。近景镜头，细微的面部表情与自然口型，背景虚化，镜头保持稳定。",
    defaults: { 人物: "一位年轻演员", 台词: "有些答案，时间会告诉我们" },
    modelId: "wan3",
    favorite: false,
  },
];
export const initialPrompts: PromptTemplate[] = defs.map((x) => ({
  ...x,
  negativePrompt: "",
  usageCount: 0,
  version: 1,
  versions: [],
  createdAt: "2026-10-24T00:00:00.000Z",
  updatedAt: "2026-10-24T00:00:00.000Z",
  deletedAt: null,
}));
