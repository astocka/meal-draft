import { useEffect, useRef, useState } from "react";
import { CircleAlert, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EXCLUSION_CAP_MESSAGE,
  EXHAUSTION_BODY,
  EXHAUSTION_HINT_MEAL_TYPE,
  EXHAUSTION_HINT_TIME,
  EXHAUSTION_HINTS_HEADING,
  EXHAUSTION_TITLE,
  rejectedCountLabel,
  TRY_ANOTHER_LABEL,
  TRY_ANOTHER_LOADING,
} from "@/lib/generation-copy";
import { parseGenerateResponse } from "@/lib/parse-generate-response";
import { cn } from "@/lib/utils";
import type { FavoriteMeal, MealRecipe, MealType } from "@/types";

const LOAD_ERROR_MESSAGE = "Nie udało się załadować Twojej spiżarni. Odśwież stronę lub spróbuj ponownie później.";

const EMPTY_PANTRY_HINT = "Dodaj składniki w zakładce Spiżarnia";

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Śniadanie" },
  { value: "lunch", label: "Obiad" },
  { value: "dinner", label: "Kolacja" },
];

const TIME_PRESETS: { value: number | null; label: string }[] = [
  { value: 15, label: "15" },
  { value: 30, label: "30" },
  { value: 60, label: "60" },
  { value: null, label: "Dowolny czas" },
];

const NO_MATCH_TITLE = "Nie udało się stworzyć przepisu";
const HINTS_HEADING = "Co możesz zrobić?";
const HINT_ADD = "Dodaj więcej składników";
const HINT_TIME = "Wydłuż czas przygotowania";
const HINT_MEAL_TYPE = "Zmień typ posiłku";

const SAVE_ARIA_LABEL = "Dodaj do ulubionych";
const UNSAVE_ARIA_LABEL = "Usuń z ulubionych";
const SAVE_SUCCESS_MESSAGE = "Dodano do ulubionych";
const UNSAVE_SUCCESS_MESSAGE = "Usunięto z ulubionych";
const SAVE_FEEDBACK_DISMISS_MS = 3000;
const SAVE_DUPLICATE_MESSAGE = "Ten posiłek jest już w ulubionych";
const SAVE_ERROR_MESSAGE = "Nie udało się dodać do ulubionych — spróbuj ponownie";
const UNSAVE_ERROR_MESSAGE = "Nie udało się usunąć z ulubionych — spróbuj ponownie";

type GeneratorStatus = "idle" | "loading" | "success" | "no_match" | "error";
type LoadingSource = "generate" | "try_another";
type GeneratorFeedback = "no_match" | "exhausted" | "error" | null;
type SaveStatus = "idle" | "saving" | "saved" | "unsaved" | "duplicate" | "error";

interface MealGeneratorProps {
  loadError: boolean;
  pantryCount: number;
}

interface RequestGenerationOptions {
  excludeNames: string[];
  resetRecipeOnLoad: boolean;
  loadingSource: LoadingSource;
}

const segmentGroupClass = cn("inline-flex w-full rounded-md border border-white/10 bg-white/5 p-0.5");

const segmentButtonClass = cn(
  "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
  "text-white/60 hover:text-white",
  "data-[active=true]:bg-purple-600/30 data-[active=true]:text-white",
  "disabled:pointer-events-none disabled:opacity-50",
);

function normalizeRecipeName(name: string): string {
  return name.trim().toLowerCase();
}

async function resolveFavoriteId(recipe: MealRecipe): Promise<string | null> {
  const res = await fetch("/api/favorites");
  if (!res.ok) return null;

  const data: { items: FavoriteMeal[] } = await res.json();
  const normalized = normalizeRecipeName(recipe.name);
  const match = data.items.find((item) => normalizeRecipeName(item.recipe.name) === normalized);
  return match?.id ?? null;
}

export default function MealGenerator({ loadError, pantryCount }: MealGeneratorProps) {
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [maxPrepMinutes, setMaxPrepMinutes] = useState<number | null>(null);
  const [status, setStatus] = useState<GeneratorStatus>("idle");
  const [lastRecipe, setLastRecipe] = useState<MealRecipe | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [shownNames, setShownNames] = useState<string[]>([]);
  const [loadingSource, setLoadingSource] = useState<LoadingSource | null>(null);
  const [feedback, setFeedback] = useState<GeneratorFeedback>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTimeHintOnNoMatch, setShowTimeHintOnNoMatch] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const saveGenerationRef = useRef(0);

  const isGenerating = loadingSource === "generate";
  const isTryAnotherLoading = loadingSource === "try_another";
  const exclusionCapReached = shownNames.length >= 20;
  const generationBlocked = loadError || pantryCount === 0 || loadingSource !== null;
  const tryAnotherAvailable = !generationBlocked && status === "success" && lastRecipe !== null && !exclusionCapReached;
  const canTryAnother = tryAnotherAvailable;
  const canGenerate = !generationBlocked && !(shownNames.length > 0 && tryAnotherAvailable);
  const showTryAnother = lastRecipe !== null && (status === "success" || loadingSource === "try_another");

  useEffect(() => {
    if (saveStatus !== "saved" && saveStatus !== "unsaved" && saveStatus !== "duplicate") return;
    const timer = setTimeout(() => {
      setSaveStatus("idle");
    }, SAVE_FEEDBACK_DISMISS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [saveStatus]);

  useEffect(() => {
    if (!lastRecipe) return;

    const generationAtCheck = saveGenerationRef.current;

    void (async () => {
      const id = await resolveFavoriteId(lastRecipe);
      if (generationAtCheck !== saveGenerationRef.current) return;

      if (id) {
        setFavoriteId(id);
        setIsFavorited(true);
      } else {
        setFavoriteId(null);
        setIsFavorited(false);
      }
    })();
  }, [lastRecipe]);

  async function requestGeneration({
    excludeNames,
    resetRecipeOnLoad,
    loadingSource: source,
  }: RequestGenerationOptions) {
    const prepAtSubmit = maxPrepMinutes;
    const hadExclusions = excludeNames.length > 0;

    setLoadingSource(source);
    setFeedback(null);
    setErrorMessage(null);
    setShowTimeHintOnNoMatch(false);
    setSaveStatus("idle");

    if (resetRecipeOnLoad) {
      setStatus("loading");
      setLastRecipe(null);
      setHistoryId(null);
      setIsFavorited(false);
      setFavoriteId(null);
    }

    let body: unknown;
    let httpStatus: number;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: mealType,
          max_prep_time_minutes: prepAtSubmit,
          exclude_names: excludeNames,
        }),
      });
      httpStatus = res.status;
      body = await res.json();
    } catch {
      const parsed = parseGenerateResponse(null, 0);
      setLoadingSource(null);
      setStatus("error");
      setFeedback("error");
      if (parsed.kind === "error") {
        setErrorMessage(parsed.message);
      }
      return;
    }

    const parsed = parseGenerateResponse(body, httpStatus);
    setLoadingSource(null);

    if (parsed.kind === "success") {
      setLastRecipe(parsed.recipe);
      setHistoryId(parsed.history_id);
      setStatus("success");
      setFeedback(null);
      return;
    }

    if (parsed.kind === "no_match") {
      setLastRecipe(null);
      setHistoryId(null);
      setShowTimeHintOnNoMatch(prepAtSubmit !== null);

      if (hadExclusions) {
        setStatus("no_match");
        setFeedback("exhausted");
      } else {
        setStatus("no_match");
        setFeedback("no_match");
      }
      return;
    }

    setErrorMessage(parsed.message);
    setStatus("error");
    setFeedback("error");
  }

  async function handleGenerate() {
    if (!canGenerate) return;

    saveGenerationRef.current += 1;
    setShownNames([]);
    await requestGeneration({
      excludeNames: [],
      resetRecipeOnLoad: true,
      loadingSource: "generate",
    });
  }

  async function handleTryAnother() {
    if (!canTryAnother) return;

    const excludeNames = [...shownNames, lastRecipe.name];
    setShownNames(excludeNames);
    await requestGeneration({
      excludeNames,
      resetRecipeOnLoad: false,
      loadingSource: "try_another",
    });
  }

  async function handleSaveFavorite() {
    if (!lastRecipe || saveStatus === "saving") return;

    const generationAtSave = saveGenerationRef.current;
    const recipeAtSave = lastRecipe;

    setSaveStatus("saving");

    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: recipeAtSave }),
      });

      if (generationAtSave !== saveGenerationRef.current) {
        setSaveStatus("idle");
        return;
      }

      if (res.status === 201) {
        const data: { item: FavoriteMeal } = await res.json();
        setFavoriteId(data.item.id);
        setIsFavorited(true);
        setSaveStatus("saved");
        return;
      }

      if (res.status === 409) {
        const id = await resolveFavoriteId(recipeAtSave);
        setFavoriteId(id);
        setIsFavorited(true);
        setSaveStatus("duplicate");
        return;
      }

      setSaveStatus("error");
    } catch {
      if (generationAtSave !== saveGenerationRef.current) {
        setSaveStatus("idle");
        return;
      }
      setSaveStatus("error");
    }
  }

  async function handleUnsaveFavorite() {
    if (!lastRecipe || saveStatus === "saving") return;

    const generationAtSave = saveGenerationRef.current;
    const recipeAtSave = lastRecipe;

    setSaveStatus("saving");

    try {
      let idToDelete = favoriteId;
      idToDelete ??= await resolveFavoriteId(recipeAtSave);

      if (generationAtSave !== saveGenerationRef.current) {
        setSaveStatus("idle");
        return;
      }

      if (!idToDelete) {
        setIsFavorited(false);
        setFavoriteId(null);
        setSaveStatus("idle");
        return;
      }

      const res = await fetch(`/api/favorites/${idToDelete}`, { method: "DELETE" });

      if (generationAtSave !== saveGenerationRef.current) {
        setSaveStatus("idle");
        return;
      }

      if (res.ok) {
        setIsFavorited(false);
        setFavoriteId(null);
        setSaveStatus("unsaved");
        return;
      }

      setSaveStatus("error");
    } catch {
      if (generationAtSave !== saveGenerationRef.current) {
        setSaveStatus("idle");
        return;
      }
      setSaveStatus("error");
    }
  }

  function handleToggleFavorite() {
    if (isFavorited) {
      void handleUnsaveFavorite();
    } else {
      void handleSaveFavorite();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {loadError && (
        <div className="shrink-0 border-b border-white/10 px-3 py-2 md:hidden">
          <p
            className="flex items-start gap-2 rounded-lg border border-purple-400/30 bg-purple-500/10 px-2.5 py-1.5 text-xs text-purple-100"
            role="status"
          >
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-purple-300" />
            {LOAD_ERROR_MESSAGE}
          </p>
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-2.5 border-b border-white/10 px-3 py-2.5">
        <div className="space-y-1">
          <p className="text-[10px] font-medium tracking-wider text-white/40 uppercase">Typ posiłku</p>
          <div className={segmentGroupClass} role="group" aria-label="Typ posiłku">
            {MEAL_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                data-active={mealType === value}
                disabled={loadingSource !== null}
                onClick={() => {
                  setMealType(value);
                }}
                className={segmentButtonClass}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-medium tracking-wider text-white/40 uppercase">
            Czas <span className="tracking-normal text-white/30 normal-case">(min)</span>
          </p>
          <div className={segmentGroupClass} role="group" aria-label="Czas przygotowania">
            {TIME_PRESETS.map(({ value, label }) => (
              <button
                key={label}
                type="button"
                data-active={maxPrepMinutes === value}
                disabled={loadingSource !== null}
                title={value === null ? "Dowolny czas" : `${label} min`}
                aria-label={value === null ? "Dowolny czas" : `${label} minut`}
                onClick={() => {
                  setMaxPrepMinutes(value);
                }}
                className={segmentButtonClass}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {exclusionCapReached && showTryAnother && <p className="text-xs text-white/50">{EXCLUSION_CAP_MESSAGE}</p>}
          <div className="flex items-center justify-end gap-2">
            {!loadError && pantryCount === 0 && <p className="text-xs text-white/40">{EMPTY_PANTRY_HINT}</p>}
            {showTryAnother && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canTryAnother}
                onClick={() => void handleTryAnother()}
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                {isTryAnotherLoading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    {TRY_ANOTHER_LOADING}
                  </>
                ) : (
                  TRY_ANOTHER_LABEL
                )}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={!canGenerate}
              onClick={() => void handleGenerate()}
              className="bg-purple-600 text-white hover:bg-purple-500"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Tworzę przepis…
                </>
              ) : (
                "Generuj"
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 p-3">
        {feedback === "exhausted" && (
          <div
            className="rounded-lg border border-purple-400/30 bg-purple-500/10 px-3 py-2.5 text-purple-100"
            role="status"
          >
            <p className="text-sm font-semibold text-white">{EXHAUSTION_TITLE}</p>
            <p className="mt-1 text-xs text-white/80">{EXHAUSTION_BODY}</p>
            <p className="mt-2 text-xs font-medium text-white/80">{EXHAUSTION_HINTS_HEADING}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-white/70">
              {showTimeHintOnNoMatch && <li>{EXHAUSTION_HINT_TIME}</li>}
              <li>{EXHAUSTION_HINT_MEAL_TYPE}</li>
            </ul>
          </div>
        )}

        {feedback === "no_match" && (
          <div
            className="rounded-lg border border-purple-400/30 bg-purple-500/10 px-3 py-2.5 text-purple-100"
            role="status"
          >
            <p className="text-sm font-semibold text-white">{NO_MATCH_TITLE}</p>
            <p className="mt-2 text-xs font-medium text-white/80">{HINTS_HEADING}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-white/70">
              <li>{HINT_ADD}</li>
              {showTimeHintOnNoMatch && <li>{HINT_TIME}</li>}
              <li>{HINT_MEAL_TYPE}</li>
            </ul>
          </div>
        )}

        {feedback === "error" && errorMessage && (
          <p
            className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-100"
            role="alert"
          >
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-red-300" />
            {errorMessage}
          </p>
        )}

        {shownNames.length > 0 && <p className="text-xs text-white/50">{rejectedCountLabel(shownNames.length)}</p>}

        {lastRecipe && (
          <Card className="gap-3 border-white/10 bg-white/5 py-3 shadow-none">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 pb-3">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={saveStatus === "saving"}
                onClick={() => {
                  handleToggleFavorite();
                }}
                className={cn(
                  "size-8 shrink-0 hover:bg-white/10",
                  isFavorited ? "text-amber-400 hover:text-amber-300" : "text-white/30 hover:text-white/60",
                )}
                aria-label={isFavorited ? UNSAVE_ARIA_LABEL : SAVE_ARIA_LABEL}
              >
                {saveStatus === "saving" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Star className={cn("size-5", isFavorited && "fill-amber-400")} />
                )}
              </Button>
              {saveStatus === "saved" && (
                <p className="text-xs text-emerald-100" role="status">
                  {SAVE_SUCCESS_MESSAGE}
                </p>
              )}
              {saveStatus === "unsaved" && (
                <p className="text-xs text-white/60" role="status">
                  {UNSAVE_SUCCESS_MESSAGE}
                </p>
              )}
              {saveStatus === "duplicate" && (
                <p className="text-xs text-purple-100" role="status">
                  {SAVE_DUPLICATE_MESSAGE}
                </p>
              )}
              {saveStatus === "error" && (
                <p className="flex items-center gap-1 text-xs text-red-100" role="alert">
                  <CircleAlert className="size-3 shrink-0 text-red-300" />
                  {isFavorited ? UNSAVE_ERROR_MESSAGE : SAVE_ERROR_MESSAGE}
                </p>
              )}
            </div>
            <CardHeader className="gap-1 px-3 pb-0">
              <CardTitle className="text-base text-white">{lastRecipe.name}</CardTitle>
              <p className="text-xs text-white/50">Czas przygotowania: {lastRecipe.prep_time_minutes} min</p>
            </CardHeader>
            <CardContent className="space-y-3 px-3">
              <div>
                <h3 className="mb-1 text-xs font-medium text-white/70">Składniki</h3>
                <ul className="list-inside list-disc space-y-0.5 text-xs text-white/80">
                  {lastRecipe.ingredients.map((ingredient) => (
                    <li key={ingredient}>{ingredient}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-medium text-white/70">Kroki</h3>
                <ol className="list-inside list-decimal space-y-1 text-xs text-white/80">
                  {lastRecipe.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>
        )}

        {historyId !== null && <span className="sr-only" data-history-id={historyId} />}
      </div>
    </div>
  );
}
