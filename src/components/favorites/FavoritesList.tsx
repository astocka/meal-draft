import { useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { FavoriteMeal } from "@/types";

const LOAD_ERROR_MESSAGE = "Nie udało się załadować ulubionych posiłków. Odśwież stronę lub spróbuj ponownie później.";

const EMPTY_FAVORITES_MESSAGE = "Nie masz jeszcze ulubionych posiłków";

const DELETE_ERROR_MESSAGE = "Nie udało się usunąć posiłku — spróbuj ponownie";

interface FavoritesListProps {
  initialItems: FavoriteMeal[];
  loadError?: boolean;
}

function sortBySavedAtDesc(items: FavoriteMeal[]): FavoriteMeal[] {
  return [...items].sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}

function formatSavedDate(savedAt: string): string {
  return new Date(savedAt).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function FavoritesList({ initialItems, loadError = false }: FavoritesListProps) {
  const [items, setItems] = useState<FavoriteMeal[]>(() => sortBySavedAtDesc(initialItems));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleDelete(id: string) {
    const removedItem = items.find((item) => item.id === id);
    if (!removedItem) return;
    const removedIndex = items.indexOf(removedItem);

    setItems((prev) => prev.filter((item) => item.id !== id));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDeleteError(null);

    try {
      const res = await fetch(`/api/favorites/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setItems((prev) => {
          const next = [...prev];
          next.splice(removedIndex, 0, removedItem);
          return sortBySavedAtDesc(next);
        });
        setDeleteError(DELETE_ERROR_MESSAGE);
      }
    } catch {
      setItems((prev) => {
        const next = [...prev];
        next.splice(removedIndex, 0, removedItem);
        return sortBySavedAtDesc(next);
      });
      setDeleteError(DELETE_ERROR_MESSAGE);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {loadError && (
        <div className="shrink-0 border-b border-white/10 p-4">
          <p
            className="flex items-start gap-2 rounded-lg border border-purple-400/30 bg-purple-500/10 px-3 py-2 text-sm text-purple-100"
            role="status"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-purple-300" />
            {LOAD_ERROR_MESSAGE}
          </p>
        </div>
      )}

      {!loadError && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {deleteError && (
            <p className="mb-3 flex items-center gap-1 text-xs text-red-300">
              <CircleAlert className="size-3 shrink-0" />
              {deleteError}
            </p>
          )}

          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-white/40">{EMPTY_FAVORITES_MESSAGE}</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const isExpanded = expandedIds.has(item.id);
                const { recipe } = item;

                return (
                  <li key={item.id}>
                    <Card className="gap-0 border-white/10 bg-white/5 py-0 shadow-none">
                      <div className="group flex items-center gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            toggleExpanded(item.id);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-expanded={isExpanded}
                        >
                          <span className="truncate text-sm font-medium text-white">{recipe.name}</span>
                          <span className="shrink-0 text-xs text-white/40">{formatSavedDate(item.saved_at)}</span>
                          {isExpanded ? (
                            <ChevronUp className="ml-auto size-4 shrink-0 text-white/40" />
                          ) : (
                            <ChevronDown className="ml-auto size-4 shrink-0 text-white/40" />
                          )}
                        </button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => void handleDelete(item.id)}
                          className="shrink-0 text-white/40 opacity-100 transition-all hover:bg-white/10 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label={`Usuń ${recipe.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      {isExpanded && (
                        <CardContent className="space-y-3 border-t border-white/10 px-3 py-3">
                          <p className="text-xs text-white/50">Czas przygotowania: {recipe.prep_time_minutes} min</p>
                          <div>
                            <h3 className="mb-1 text-xs font-medium text-white/70">Składniki</h3>
                            <ul className="list-inside list-disc space-y-0.5 text-xs text-white/80">
                              {recipe.ingredients.map((ingredient) => (
                                <li key={ingredient}>{ingredient}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h3 className="mb-1 text-xs font-medium text-white/70">Kroki</h3>
                            <ol className="list-inside list-decimal space-y-1 text-xs text-white/80">
                              {recipe.steps.map((step, index) => (
                                <li key={index}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
