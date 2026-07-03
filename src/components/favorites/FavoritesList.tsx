import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MEAL_TYPE_OPTIONS } from "@/lib/meal-types";
import type { FavoriteMeal, MealType } from "@/types";

const LOAD_ERROR_MESSAGE = "Nie udało się załadować ulubionych posiłków. Odśwież stronę lub spróbuj ponownie później.";

const DELETE_ERROR_MESSAGE = "Nie udało się usunąć posiłku — spróbuj ponownie";

const EMPTY_BY_MEAL_TYPE: Record<MealType, string> = {
  breakfast: "Nie masz ulubionych posiłków na śniadanie",
  lunch: "Nie masz ulubionych posiłków na obiad",
  dinner: "Nie masz ulubionych posiłków na kolację",
};

interface FavoritesListProps {
  initialItems: FavoriteMeal[];
  mealType: MealType;
  loadError?: boolean;
}

function sortBySavedAtDesc(items: FavoriteMeal[]): FavoriteMeal[] {
  return [...items].sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}

function restoreDeletedItem(items: FavoriteMeal[], removedItem: FavoriteMeal): FavoriteMeal[] {
  if (items.some((item) => item.id === removedItem.id)) return items;
  return sortBySavedAtDesc([...items, removedItem]);
}

function formatSavedDate(savedAt: string): string {
  const date = new Date(savedAt);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

export default function FavoritesList({ initialItems, mealType, loadError = false }: FavoritesListProps) {
  const [items, setItems] = useState<FavoriteMeal[]>(() => sortBySavedAtDesc(initialItems));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());

  const filteredItems = useMemo(() => items.filter((item) => item.meal_type === mealType), [items, mealType]);

  const emptyMessage = EMPTY_BY_MEAL_TYPE[mealType];
  const mealTypeLabel = MEAL_TYPE_OPTIONS.find((option) => option.value === mealType)?.label ?? mealType;

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
    if (deletingIds.has(id)) return;

    const removedItem = items.find((item) => item.id === id);
    if (!removedItem) return;

    setDeletingIds((prev) => new Set(prev).add(id));
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
        setItems((prev) => restoreDeletedItem(prev, removedItem));
        setDeleteError(DELETE_ERROR_MESSAGE);
      }
    } catch {
      setItems((prev) => restoreDeletedItem(prev, removedItem));
      setDeleteError(DELETE_ERROR_MESSAGE);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-border bg-card/60 hidden shrink-0 border-b px-5 py-3.5 md:block">
        <h2 className="text-foreground/70 flex items-center gap-2.5 text-xs font-semibold tracking-[0.12em] uppercase">
          <span className="bg-primary h-3 w-0.5 rounded-full" />
          {mealTypeLabel}
        </h2>
      </div>

      {loadError && (
        <div className="border-border shrink-0 border-b p-4">
          <p
            className="border-primary/30 bg-primary/10 text-foreground flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            role="status"
          >
            <CircleAlert className="text-primary mt-0.5 size-4 shrink-0" />
            {LOAD_ERROR_MESSAGE}
          </p>
        </div>
      )}

      {!loadError && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {deleteError && (
            <p className="text-destructive mb-3 flex items-center gap-1 text-xs">
              <CircleAlert className="size-3 shrink-0" />
              {deleteError}
            </p>
          )}

          {filteredItems.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">{emptyMessage}</p>
          ) : (
            <ul className="space-y-3">
              {filteredItems.map((item) => {
                const isExpanded = expandedIds.has(item.id);
                const { recipe } = item;

                return (
                  <li key={item.id}>
                    <Card className="gap-0 py-0 shadow-none">
                      <div className="group flex items-center gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            toggleExpanded(item.id);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-expanded={isExpanded}
                        >
                          <span className="text-foreground truncate text-sm font-medium">{recipe.name}</span>
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {formatSavedDate(item.saved_at)}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="text-muted-foreground ml-auto size-4 shrink-0" />
                          ) : (
                            <ChevronDown className="text-muted-foreground ml-auto size-4 shrink-0" />
                          )}
                        </button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={deletingIds.has(item.id)}
                          onClick={() => void handleDelete(item.id)}
                          className="text-muted-foreground hover:bg-accent hover:text-destructive shrink-0 opacity-100 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label={`Usuń ${recipe.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      {isExpanded && (
                        <CardContent className="border-border space-y-3 border-t px-3 py-3">
                          <p className="text-foreground text-sm font-medium md:hidden">{recipe.name}</p>
                          <p className="text-muted-foreground text-xs">
                            Czas przygotowania: {recipe.prep_time_minutes} min
                          </p>
                          <div>
                            <h3 className="text-muted-foreground mb-1 text-xs font-medium">Składniki</h3>
                            <ul className="text-foreground/80 list-inside list-disc space-y-0.5 text-xs">
                              {recipe.ingredients.map((ingredient) => (
                                <li key={ingredient}>{ingredient}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h3 className="text-muted-foreground mb-1 text-xs font-medium">Kroki</h3>
                            <ol className="text-foreground/80 list-inside list-decimal space-y-1 text-xs">
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
