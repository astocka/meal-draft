import { useState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseGenerateResponse } from "@/lib/parse-generate-response";
import { cn } from "@/lib/utils";
import type { MealRecipe, MealType } from "@/types";

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
  { value: null, label: "Dow." },
];

const NO_MATCH_TITLE = "Nie udało się stworzyć przepisu";
const HINTS_HEADING = "Co możesz zrobić?";
const HINT_ADD = "Dodaj więcej składników";
const HINT_TIME = "Wydłuż czas przygotowania";
const HINT_MEAL_TYPE = "Zmień typ posiłku";

type GeneratorStatus = "idle" | "loading" | "success" | "no_match" | "error";

interface MealGeneratorProps {
  loadError: boolean;
  pantryCount: number;
}

const segmentGroupClass = cn("inline-flex w-full rounded-md border border-white/10 bg-white/5 p-0.5");

const segmentButtonClass = cn(
  "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
  "text-white/60 hover:text-white",
  "data-[active=true]:bg-purple-600/30 data-[active=true]:text-white",
  "disabled:pointer-events-none disabled:opacity-50",
);

export default function MealGenerator({ loadError, pantryCount }: MealGeneratorProps) {
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [maxPrepMinutes, setMaxPrepMinutes] = useState<number | null>(null);
  const [status, setStatus] = useState<GeneratorStatus>("idle");
  const [lastRecipe, setLastRecipe] = useState<MealRecipe | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"no_match" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTimeHintOnNoMatch, setShowTimeHintOnNoMatch] = useState(false);

  const isLoading = status === "loading";
  const canGenerate = !loadError && pantryCount > 0 && !isLoading;

  async function handleGenerate() {
    if (!canGenerate) return;

    const prepAtSubmit = maxPrepMinutes;
    setStatus("loading");
    setFeedback(null);
    setErrorMessage(null);
    setShowTimeHintOnNoMatch(false);

    let body: unknown;
    let httpStatus: number;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: mealType,
          max_prep_time_minutes: prepAtSubmit,
          exclude_names: [],
        }),
      });
      httpStatus = res.status;
      body = await res.json();
    } catch {
      const parsed = parseGenerateResponse(null, 0);
      setStatus("error");
      setFeedback("error");
      if (parsed.kind === "error") {
        setErrorMessage(parsed.message);
      }
      return;
    }

    const parsed = parseGenerateResponse(body, httpStatus);

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
      setStatus("no_match");
      setFeedback("no_match");
      return;
    }

    setErrorMessage(parsed.message);
    setStatus("error");
    setFeedback("error");
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
                disabled={isLoading}
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
                disabled={isLoading}
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

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!canGenerate}
            onClick={() => void handleGenerate()}
            className="bg-purple-600 text-white hover:bg-purple-500"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Tworzę…
              </>
            ) : (
              "Generuj"
            )}
          </Button>
          {!loadError && pantryCount === 0 && <p className="text-xs text-white/40">{EMPTY_PANTRY_HINT}</p>}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 p-3">
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

        {lastRecipe && (
          <Card className="gap-3 border-white/10 bg-white/5 py-3 shadow-none">
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
