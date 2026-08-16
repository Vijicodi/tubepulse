import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GenerateIdeasButton } from "@/components/generate-ideas-button";
import { IdeaList } from "@/components/idea-list";
import { VideoTable } from "@/components/video-table";
import { Badge } from "@/components/ui/badge";
import { createServerClient, getUser } from "@/lib/supabase/server";

/**
 * A researched channel: its videos ranked by how far they beat the channel's
 * own median, and the ideas generated from them.
 *
 * Server component — the queries run on the server under row-level security,
 * so there is no way to read another user's channel by changing the URL.
 */
export default async function ChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getUser();
  if (!user) redirect("/");

  const supabase = await createServerClient();

  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("id", id)
    .single();

  if (!channel) notFound();

  const [{ data: videos }, { data: ideas }] = await Promise.all([
    supabase
      .from("videos")
      .select("*")
      .eq("channel_id", id)
      .order("outlier_score", { ascending: false, nullsFirst: false })
      .limit(50),
    supabase
      .from("ideas")
      .select("*")
      .eq("channel_id", id)
      .order("confidence", { ascending: false })
      .limit(20),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12">
      <div className="space-y-4">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Research another channel
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">
              {channel.title ?? channel.handle}
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              {channel.handle}
              {channel.subscriber_count !== null && (
                <> · {Number(channel.subscriber_count).toLocaleString()} subscribers</>
              )}
            </p>
          </div>
          <Badge variant="secondary" className="font-mono">
            {videos?.length ?? 0} videos analysed
          </Badge>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Ideas</h2>
            <p className="text-muted-foreground text-sm">
              Generated from the breakouts below. Each one cites its evidence.
            </p>
          </div>
          <GenerateIdeasButton channelId={id} hasIdeas={(ideas?.length ?? 0) > 0} />
        </div>
        <IdeaList ideas={ideas ?? []} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Videos by outlier score</h2>
          <p className="text-muted-foreground text-sm">
            Score is views ÷ this channel&apos;s median. 1.0 is typical for them; 3.0 means
            three times their own normal.
          </p>
        </div>
        <VideoTable videos={videos ?? []} />
      </section>
    </main>
  );
}
