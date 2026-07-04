import { useEffect, useRef, useState } from "react";
import { CircleAlert, Info, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

import { MEAL_TYPE_OPTIONS } from "@/lib/meal-types";

const TIME_PRESETS: { value: number | null; label: string }[] = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "60 min" },
  { value: null, label: "Dowolny" },
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

const segmentGroupClass = cn("flex flex-wrap gap-1.5");

const segmentButtonClass = cn(
  "rounded-full border border-border/50 px-3 py-1 text-xs font-medium whitespace-nowrap transition-all",
  "text-muted-foreground hover:text-foreground hover:border-border",
  "data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
  "disabled:pointer-events-none disabled:opacity-40",
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
  const canGenerate = !generationBlocked && !tryAnotherAvailable;
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
    const mealTypeAtSave = mealType;

    setSaveStatus("saving");

    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: recipeAtSave, meal_type: mealTypeAtSave }),
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border bg-card/60 mx-3 mt-3 flex shrink-0 flex-col gap-5 rounded-xl border px-4 py-4 shadow-sm">
        {loadError && (
          <p
            className="border-primary/30 bg-primary/10 text-foreground flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs md:hidden"
            role="status"
          >
            <CircleAlert className="text-primary mt-0.5 size-3.5 shrink-0" />
            {LOAD_ERROR_MESSAGE}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-muted-foreground/60 text-[9px] font-semibold tracking-[0.15em] uppercase">Typ posiłku</p>
          <div className={segmentGroupClass} role="group" aria-label="Typ posiłku">
            {MEAL_TYPE_OPTIONS.map(({ value, label }) => (
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

        <div className="space-y-2">
          <p className="text-muted-foreground/60 text-[9px] font-semibold tracking-[0.15em] uppercase">
            Czas przygotowania
          </p>
          <div className={segmentGroupClass} role="group" aria-label="Czas przygotowania">
            {TIME_PRESETS.map(({ value, label }) => (
              <button
                key={label}
                type="button"
                data-active={maxPrepMinutes === value}
                disabled={loadingSource !== null}
                title={value === null ? "Dowolny czas" : `${String(value)} min`}
                aria-label={value === null ? "Dowolny czas" : `${String(value)} minut`}
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

        <div className="flex flex-col items-start gap-2">
          {exclusionCapReached && showTryAnother && (
            <p className="text-muted-foreground text-xs">{EXCLUSION_CAP_MESSAGE}</p>
          )}
          {!loadError && pantryCount === 0 && (
            <p className="border-primary/25 bg-primary/8 text-foreground flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs">
              <Info className="text-primary size-3.5 shrink-0" />
              {EMPTY_PANTRY_HINT}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-start gap-2.5">
            <Button
              type="button"
              variant={showTryAnother ? "outline" : "default"}
              disabled={!canGenerate}
              onClick={() => void handleGenerate()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Tworzę przepis…
                </>
              ) : (
                "Generuj"
              )}
            </Button>
            {showTryAnother && (
              <Button type="button" variant="default" disabled={!canTryAnother} onClick={() => void handleTryAnother()}>
                {isTryAnotherLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {TRY_ANOTHER_LOADING}
                  </>
                ) : (
                  TRY_ANOTHER_LABEL
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pt-3 pb-24 md:pb-4">
        {feedback === "exhausted" && (
          <div className="border-primary/20 bg-primary/8 rounded-lg border px-3.5 py-3" role="status">
            <p className="text-foreground text-xs font-semibold">{EXHAUSTION_TITLE}</p>
            <p className="text-muted-foreground mt-1 text-xs">{EXHAUSTION_BODY}</p>
            <p className="text-muted-foreground mt-2 text-[10px] font-semibold tracking-wide uppercase">
              {EXHAUSTION_HINTS_HEADING}
            </p>
            <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
              {showTimeHintOnNoMatch && (
                <li className="flex items-start gap-2">
                  <span className="bg-primary/50 mt-1.5 size-1 shrink-0 rounded-full" />
                  {EXHAUSTION_HINT_TIME}
                </li>
              )}
              <li className="flex items-start gap-2">
                <span className="bg-primary/50 mt-1.5 size-1 shrink-0 rounded-full" />
                {EXHAUSTION_HINT_MEAL_TYPE}
              </li>
            </ul>
          </div>
        )}

        {feedback === "no_match" && (
          <div className="border-primary/20 bg-primary/8 rounded-lg border px-3.5 py-3" role="status">
            <p className="text-foreground text-xs font-semibold">{NO_MATCH_TITLE}</p>
            <p className="text-muted-foreground mt-2 text-[10px] font-semibold tracking-wide uppercase">
              {HINTS_HEADING}
            </p>
            <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
              <li className="flex items-start gap-2">
                <span className="bg-primary/50 mt-1.5 size-1 shrink-0 rounded-full" />
                {HINT_ADD}
              </li>
              {showTimeHintOnNoMatch && (
                <li className="flex items-start gap-2">
                  <span className="bg-primary/50 mt-1.5 size-1 shrink-0 rounded-full" />
                  {HINT_TIME}
                </li>
              )}
              <li className="flex items-start gap-2">
                <span className="bg-primary/50 mt-1.5 size-1 shrink-0 rounded-full" />
                {HINT_MEAL_TYPE}
              </li>
            </ul>
          </div>
        )}

        {feedback === "error" && errorMessage && (
          <p
            className="border-destructive/25 bg-destructive/8 text-destructive flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs"
            role="alert"
          >
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            {errorMessage}
          </p>
        )}

        {shownNames.length > 0 && (
          <p className="text-muted-foreground/60 text-xs">{rejectedCountLabel(shownNames.length)}</p>
        )}

        {lastRecipe && (
          <Card className="ring-border/40 gap-0 overflow-hidden py-0 ring-1">
            <div className="bg-card/80 border-border flex items-center gap-2.5 border-b px-4 py-2.5">
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={saveStatus === "saving"}
                onClick={() => {
                  handleToggleFavorite();
                }}
                className={cn(
                  "size-8 shrink-0 rounded-lg",
                  isFavorited
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-400 hover:border-amber-400/60 hover:bg-amber-400/15 hover:text-amber-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={isFavorited ? UNSAVE_ARIA_LABEL : SAVE_ARIA_LABEL}
              >
                {saveStatus === "saving" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Star className={cn("size-4", isFavorited && "fill-amber-400")} />
                )}
              </Button>
              {saveStatus === "saved" && (
                <p className="text-foreground text-xs" role="status">
                  {SAVE_SUCCESS_MESSAGE}
                </p>
              )}
              {saveStatus === "unsaved" && (
                <p className="text-muted-foreground text-xs" role="status">
                  {UNSAVE_SUCCESS_MESSAGE}
                </p>
              )}
              {saveStatus === "duplicate" && (
                <p className="text-muted-foreground text-xs" role="status">
                  {SAVE_DUPLICATE_MESSAGE}
                </p>
              )}
              {saveStatus === "error" && (
                <p className="text-destructive flex items-center gap-1 text-xs" role="alert">
                  <CircleAlert className="size-3 shrink-0" />
                  {isFavorited ? UNSAVE_ERROR_MESSAGE : SAVE_ERROR_MESSAGE}
                </p>
              )}
            </div>
            <div className="space-y-4 p-4">
              <div>
                <h3 className="text-foreground text-sm leading-snug font-semibold">{lastRecipe.name}</h3>
                <p className="text-muted-foreground mt-0.5 text-[10px] tracking-wide">
                  Czas przygotowania:{" "}
                  <span className="text-primary font-medium">{lastRecipe.prep_time_minutes} min</span>
                </p>
              </div>
              <div>
                <h4 className="text-muted-foreground/70 mb-2 text-[9px] font-semibold tracking-[0.15em] uppercase">
                  Składniki
                </h4>
                <ul className="text-foreground/75 space-y-1 text-xs">
                  {lastRecipe.ingredients.map((ingredient) => (
                    <li key={ingredient} className="flex items-start gap-2">
                      <span className="bg-primary/50 mt-1.5 size-1 shrink-0 rounded-full" />
                      {ingredient}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-muted-foreground/70 mb-2 text-[9px] font-semibold tracking-[0.15em] uppercase">
                  Kroki
                </h4>
                <ol className="text-foreground/75 space-y-2 text-xs">
                  {lastRecipe.steps.map((step, index) => (
                    <li key={index} className="flex gap-2.5">
                      <span className="text-primary/70 mt-px shrink-0 font-semibold tabular-nums">{index + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Card>
        )}

        {historyId !== null && <span className="sr-only" data-history-id={historyId} />}
      </div>
    </div>
  );
}
