import { useEffect, useState } from "react";
import { Plus, Trash2, Check, X, Loader2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPantryNameError } from "@/lib/pantry-name";
import { cn } from "@/lib/utils";
import type { PantryProduct } from "@/types";

const LOAD_ERROR_MESSAGE = "Nie udało się załadować Twojej spiżarni. Odśwież stronę lub spróbuj ponownie później.";

const EMPTY_PANTRY_MESSAGE = "Twoja spiżarnia jest pusta – dodaj swój pierwszy składnik";

interface Props {
  initialItems: PantryProduct[];
  loadError?: boolean;
  onItemsChange?: (count: number) => void;
}

function sortItems(items: PantryProduct[]): PantryProduct[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function insertSorted(items: PantryProduct[], item: PantryProduct): PantryProduct[] {
  const index = items.findIndex((i) => i.name.localeCompare(item.name) > 0);
  if (index === -1) return [...items, item];
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function hasItemField(value: object): value is { item: unknown } {
  return "item" in value;
}

function parsePantryItemResponse(body: unknown): PantryProduct | null {
  if (typeof body !== "object" || body === null || !hasItemField(body)) {
    return null;
  }
  const { item } = body;
  if (typeof item !== "object" || item === null) {
    return null;
  }
  if (
    !("id" in item) ||
    !("user_id" in item) ||
    !("name" in item) ||
    !("created_at" in item) ||
    !("updated_at" in item)
  ) {
    return null;
  }
  const { id, user_id, name, created_at, updated_at } = item;
  if (
    typeof id !== "string" ||
    typeof user_id !== "string" ||
    typeof name !== "string" ||
    typeof created_at !== "string" ||
    typeof updated_at !== "string"
  ) {
    return null;
  }
  return { id, user_id, name, created_at, updated_at };
}

const inputBase =
  "w-full rounded-xl bg-input border border-border/50 px-3 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring/50 transition-colors text-sm";

export default function PantryWidget({ initialItems, loadError = false, onItemsChange }: Props) {
  const [items, setItems] = useState<PantryProduct[]>(() => sortItems(initialItems));

  useEffect(() => {
    onItemsChange?.(items.length);
  }, [items.length, onItemsChange]);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = newName.trim();
    const nameError = getPantryNameError(newName);
    if (nameError) {
      setAddError(nameError);
      return;
    }

    const tempItem: PantryProduct = {
      id: `temp-${Date.now()}`,
      user_id: "",
      name: trimmed,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setItems((prev) => insertSorted(prev, tempItem));
    setNewName("");
    setAddError(null);

    try {
      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (res.status === 409) {
        setItems((prev) => prev.filter((i) => i.id !== tempItem.id));
        setNewName(trimmed);
        setAddError(`„${trimmed}" jest już w spiżarni`);
        return;
      }

      if (!res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== tempItem.id));
        setAddError("Nie udało się dodać składnika — spróbuj ponownie");
        return;
      }

      const item = parsePantryItemResponse(await res.json());
      if (!item) {
        setItems((prev) => prev.filter((i) => i.id !== tempItem.id));
        setAddError("Nie udało się dodać składnika — spróbuj ponownie");
        return;
      }
      setItems((prev) =>
        insertSorted(
          prev.filter((i) => i.id !== tempItem.id),
          item,
        ),
      );
    } catch {
      setItems((prev) => prev.filter((i) => i.id !== tempItem.id));
      setAddError("Nie udało się dodać składnika — spróbuj ponownie");
    }
  }

  async function handleDelete(id: string) {
    const removedItem = items.find((i) => i.id === id);
    if (!removedItem) return;
    const removedIndex = items.indexOf(removedItem);

    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleteError(null);

    try {
      const res = await fetch(`/api/pantry/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setItems((prev) => {
          const next = [...prev];
          next.splice(removedIndex, 0, removedItem);
          return next;
        });
        setDeleteError("Nie udało się usunąć składnika — spróbuj ponownie");
      }
    } catch {
      setItems((prev) => {
        const next = [...prev];
        next.splice(removedIndex, 0, removedItem);
        return next;
      });
      setDeleteError("Nie udało się usunąć składnika — spróbuj ponownie");
    }
  }

  function startEdit(item: PantryProduct) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditError(null);
  }

  async function handleRename() {
    if (!editingId) return;
    const trimmed = editName.trim();
    const nameError = getPantryNameError(editName);
    if (nameError) {
      setEditError(nameError);
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/pantry/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (res.status === 409) {
        setEditError(`„${trimmed}" jest już w spiżarni`);
        setEditLoading(false);
        return;
      }

      if (!res.ok) {
        setEditError("Nie udało się zmienić nazwy — spróbuj ponownie");
        setEditLoading(false);
        return;
      }

      const item = parsePantryItemResponse(await res.json());
      if (!item) {
        setEditError("Nie udało się zmienić nazwy — spróbuj ponownie");
        setEditLoading(false);
        return;
      }
      setItems((prev) => sortItems(prev.map((i) => (i.id === editingId ? item : i))));
      setEditingId(null);
      setEditName("");
      setEditLoading(false);
    } catch {
      setEditError("Nie udało się zmienić nazwy — spróbuj ponownie");
      setEditLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
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
        <>
          {/* Add zone */}
          <div className="border-border bg-card/40 shrink-0 border-b p-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (addError) setAddError(null);
                }}
                onBlur={() => {
                  setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                }}
                placeholder="Dodaj składnik…"
                className={cn(inputBase, addError && "border-destructive focus:ring-destructive")}
              />
              <Button
                type="button"
                size="icon-lg"
                onClick={() => void handleAdd()}
                className="shrink-0 rounded-xl"
                aria-label="Dodaj składnik"
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {addError && (
              <p className="text-destructive mt-1.5 flex items-center gap-1 text-xs">
                <CircleAlert className="size-3 shrink-0" />
                {addError}
              </p>
            )}
          </div>

          {/* List area */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {deleteError && (
              <p className="text-destructive flex items-center gap-1 px-4 pt-3 text-xs">
                <CircleAlert className="size-3 shrink-0" />
                {deleteError}
              </p>
            )}
            {items.length === 0 ? (
              <p className="text-muted-foreground/50 p-8 text-center text-sm">{EMPTY_PANTRY_MESSAGE}</p>
            ) : (
              <ul className="divide-border/50 divide-y">
                {items.map((item) =>
                  editingId === item.id ? (
                    <li key={item.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => {
                            setEditName(e.target.value);
                            if (editError) setEditError(null);
                          }}
                          onBlur={() => {
                            setEditError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename();
                            if (e.key === "Escape") cancelEdit();
                          }}
                          disabled={editLoading}
                          autoFocus
                          className={cn(
                            inputBase,
                            "flex-1",
                            editError && "border-destructive focus:ring-destructive",
                            editLoading && "cursor-not-allowed opacity-60",
                          )}
                        />
                        <Button
                          type="button"
                          size="icon"
                          onClick={() => void handleRename()}
                          disabled={editLoading}
                          className="shrink-0"
                          aria-label="Confirm rename"
                        >
                          {editLoading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          onClick={cancelEdit}
                          disabled={editLoading}
                          variant="ghost"
                          className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
                          aria-label="Cancel rename"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      {editError && (
                        <p className="text-destructive mt-1.5 flex items-center gap-1 text-xs">
                          <CircleAlert className="size-3 shrink-0" />
                          {editError}
                        </p>
                      )}
                    </li>
                  ) : (
                    <li
                      key={item.id}
                      className="group hover:bg-accent/30 flex items-center justify-between px-4 py-2.5 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          startEdit(item);
                        }}
                        className={cn(
                          "text-foreground/85 hover:text-primary flex-1 truncate text-left text-sm transition-colors",
                          item.id.startsWith("temp-") && "cursor-default opacity-40",
                        )}
                        disabled={item.id.startsWith("temp-")}
                      >
                        {item.name}
                      </button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void handleDelete(item.id)}
                        disabled={item.id.startsWith("temp-")}
                        className="text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive shrink-0 opacity-100 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
