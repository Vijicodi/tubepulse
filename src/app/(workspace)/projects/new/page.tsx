import { WorkspacePanel } from "@/components/workspace/panel";
import { CreateProjectForm } from "@/components/workspace/create-project-form";

export const metadata = { title: "New project — TubePulse" };

export default function NewProjectPage() {
  return (
    <WorkspacePanel
      title="New project"
      description="Each project is a separate research workspace with its own competitors, outliers and ideas."
    >
      <CreateProjectForm
        heading="Create a project"
        description="Name it after the channel or niche you are researching."
      />
    </WorkspacePanel>
  );
}
