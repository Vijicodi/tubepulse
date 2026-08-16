import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspacePanel } from "@/components/workspace/panel";

export const metadata = { title: "Extract transcript — TubePulse" };

export default function TranscriptPage() {
  return (
    <WorkspacePanel
      title="Extract transcript"
      description="Pull the spoken-word transcript from any public video."
    >
      <div className="surface-raised rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <span className="bg-muted/60 grid size-10 shrink-0 place-items-center rounded-xl">
            <FileText className="text-muted-foreground size-5" aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold tracking-tight">Extract a video transcript</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Paste one public YouTube video URL. This pulls the video&apos;s
              spoken-word transcript, using auto-generated captions where the
              creator has not supplied their own.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="video-url" className="text-xs">
              YouTube video URL
            </Label>
            <Input
              id="video-url"
              disabled
              placeholder="https://www.youtube.com/watch?v=…"
              className="h-11"
            />
          </div>
          <Button disabled className="bg-brand-gradient h-11 text-white">
            Extract transcript
          </Button>
        </div>

        <p className="text-muted-foreground mt-3 text-xs">
          Switches on with the scraping feature.
        </p>
      </div>
    </WorkspacePanel>
  );
}
