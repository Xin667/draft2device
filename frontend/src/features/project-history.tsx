import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { deleteProject, listProjects } from '../api/api';
import type { Project } from '../api/types';

interface ProjectHistoryProps {
  currentProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (id: string) => void;
  isCreating?: boolean;
  refreshTrigger?: number; // hochzählen, um die Liste neu zu laden
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const PROJECTS_PER_PAGE = 10;

export function ProjectHistory({
  currentProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  isCreating,
  refreshTrigger,
}: ProjectHistoryProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const loadProjects = useCallback(() => {
    setIsLoading(true);
    listProjects()
      .then((res) => setProjects(res.projects))
      .catch(() => setProjects([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    setShowAllProjects(false);
    loadProjects();
    // refreshTrigger sorgt dafür, dass wir nach dem Anlegen eines neuen
    // Projekts die Liste erneut abrufen
  }, [refreshTrigger, loadProjects]);

  const visibleProjects = showAllProjects
    ? projects
    : projects.slice(0, PROJECTS_PER_PAGE);
  const hasOlderProjects = projects.length > PROJECTS_PER_PAGE;

  async function handleDelete(project: Project) {
    if (!window.confirm(`Projekt "${project.name}" wirklich löschen?`)) return;

    setIsDeleting(true);
    try {
      await deleteProject(project.id);
      if (project.id === currentProjectId) {
        onDeleteProject?.(project.id);
      }
      await loadProjects();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Button
        variant="default"
        onClick={() => onCreateProject()}
        disabled={isCreating}
        className="w-full mb-4 flex items-center justify-center gap-2"
      >
        <Plus size={16} />
        {isCreating ? 'Wird erstellt…' : 'Neues Projekt'}
      </Button>

      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8A8371] mb-2 px-1">
        Verlauf
      </h3>

      <div className="flex flex-1 basis-0 min-h-0 flex-col gap-1 overflow-y-auto">
        {isLoading && projects.length === 0 && (
          <p className="text-sm text-[#8A8371] px-1">hier kommen die Projekte hinzu.</p>
        )}

        {!isLoading && projects.length === 0 && (
          <p className="text-sm text-[#8A8371] px-1">
            Noch keine Projekte vorhanden.
          </p>
        )}

        {visibleProjects.map((project) => {
          const isActive = project.id === currentProjectId;
          return (
            <div
              key={project.id}
              className={`group flex items-center gap-1 rounded-xl border text-sm transition-colors ${
                isActive
                  ? 'bg-orange-50 text-[#1E2430] border-orange-200'
                  : 'hover:bg-[#FAF8F4] text-[#1E2430]/80 border-transparent'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectProject(project.id)}
                className="min-w-0 flex-1 px-3 py-2 text-left"
              >
                <div className="font-medium truncate">{project.name}</div>
                <div className="text-xs text-[#8A8371]">
                  {formatDate(project.created_at)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(project)}
                disabled={isDeleting}
                aria-label={`Projekt ${project.name} löschen`}
                title="Projekt löschen"
                className="mr-2 rounded-lg p-2 text-[#8A8371] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}

        {!showAllProjects && hasOlderProjects && (
          <button
            type="button"
            onClick={() => setShowAllProjects(true)}
            aria-label="Ältere Projekte anzeigen"
            aria-expanded={showAllProjects}
            className="px-3 py-2 text-center text-sm font-medium text-[#C46A2B] hover:bg-[#FAF8F4] rounded-xl"
          >
            ...
          </button>
        )}
      </div>
    </div>
  );
}
