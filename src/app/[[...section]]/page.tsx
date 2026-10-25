import { Studio } from "@/components/studio";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  return <Studio initialPage={section?.[0] || "video"} />;
}
