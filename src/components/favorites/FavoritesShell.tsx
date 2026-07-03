import { useState } from "react";
import FavoritesList from "@/components/favorites/FavoritesList";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MEAL_TYPE_OPTIONS } from "@/lib/meal-types";
import { cn } from "@/lib/utils";
import type { FavoriteMeal, MealType } from "@/types";

interface FavoritesShellProps {
  initialItems: FavoriteMeal[];
  loadError?: boolean;
}

const columnHeaderClass = cn("shrink-0 border-b border-border bg-card/60 px-5 py-3.5");

const tabsListClass = cn("h-auto w-full shrink-0 rounded-none border-b border-border bg-muted/25 px-3 py-2.5");

const tabsTriggerClass = cn(
  "flex-1 rounded-lg py-2 text-xs font-medium text-muted-foreground",
  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
);

const mealTypeButtonClass = cn(
  "w-full rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors",
  "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
);

function MealTypeSidebar({
  mealType,
  onMealTypeChange,
}: {
  mealType: MealType;
  onMealTypeChange: (value: MealType) => void;
}) {
  return (
    <>
      <div className={columnHeaderClass}>
        <h2 className="text-foreground/70 flex items-center gap-2.5 text-xs font-semibold tracking-[0.12em] uppercase">
          <span className="bg-primary h-3 w-0.5 rounded-full" />
          Typ posiłku
        </h2>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
        {MEAL_TYPE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            data-active={mealType === value}
            onClick={() => {
              onMealTypeChange(value);
            }}
            className={cn(mealTypeButtonClass, mealType === value && "bg-accent text-accent-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

export default function FavoritesShell({ initialItems, loadError = false }: FavoritesShellProps) {
  const [mealType, setMealType] = useState<MealType>("breakfast");

  function handleMealTypeChange(value: string) {
    setMealType(value as MealType);
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Tabs
        value={mealType}
        onValueChange={handleMealTypeChange}
        className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
      >
        <TabsList className={cn(tabsListClass, "md:hidden")}>
          {MEAL_TYPE_OPTIONS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className={tabsTriggerClass}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="border-border hidden min-h-0 min-w-0 flex-col overflow-hidden md:flex md:border-r">
            <MealTypeSidebar mealType={mealType} onMealTypeChange={setMealType} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <FavoritesList initialItems={initialItems} loadError={loadError} mealType={mealType} />
          </div>
        </div>
      </Tabs>
    </div>
  );
}
