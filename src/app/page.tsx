import Link from "next/link";
import { CodeXml } from "lucide-react";
import { ResearchForm } from "@/components/research-form";
import { Card, CardContent } from "@/components/ui/card";

const steps = [
  {
    title: "It reads the channel",
    body: "An Apify actor pulls up to 100 recent videos with their real view, like and comment counts.",
  },
  {
    title: "It finds the outliers",
    body: "Every video is scored against that channel's own median — not against YouTube at large. A 500k video is a flop on one channel and a breakout on another.",
  },
  {
    title: "It explains what to make",
    body: "The breakouts, plus what the wider web is saying, become ranked ideas. Every idea cites the videos it came from.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-12 px-6 py-16">
      <header className="space-y-4">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
          YT Growth
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Find out what is actually working on a channel.
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg">
          Paste a competitor. Get their real numbers, the videos that beat their own
          average, and video ideas with the evidence attached.
        </p>
      </header>

      <ResearchForm />

      <section className="grid gap-4 sm:grid-cols-3">
        {steps.map((step) => (
          <Card key={step.title}>
            <CardContent className="space-y-2 py-5">
              <h2 className="font-semibold">{step.title}</h2>
              <p className="text-muted-foreground text-sm">{step.body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <footer className="text-muted-foreground flex items-center justify-between border-t pt-6 text-sm">
        <span>MIT licensed. Built by Vishruth Vijay.</span>
        <Link
          href="https://github.com/VishruthVijay/yt-growth"
          className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          <CodeXml className="size-4" aria-hidden />
          Source
        </Link>
      </footer>
    </main>
  );
}
