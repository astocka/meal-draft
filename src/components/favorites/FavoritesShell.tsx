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

const columnHeaderClass = cn(
  "shrink-0 border-b border-white/10 px-5 py-3 text-sm font-semibold tracking-widest text-white/40 uppercase",
);

const tabsListClass = cn("h-auto w-full shrink-0 rounded-none border-b border-white/10 bg-white/5 p-1");

const tabsTriggerClass = cn(
  "flex-1 rounded-md text-white/60 data-[state=active]:bg-purple-600/25 data-[state=active]:text-white",
);

const mealTypeButtonClass = cn(
  "w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors",
  "text-white/60 hover:bg-white/5 hover:text-white",
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
        <h2>Typ posiłku</h2>
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
            className={cn(mealTypeButtonClass, mealType === value && "bg-purple-600/25 text-white")}
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
    <div className="dark text-foreground flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Tabs
        value={mealType}
        onValueChange={handleMealTypeChange}
        className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
      >
        <TabsList variant="line" className={cn(tabsListClass, "md:hidden")}>
          {MEAL_TYPE_OPTIONS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className={tabsTriggerClass}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="hidden min-h-0 min-w-0 flex-col overflow-hidden border-white/10 md:flex md:border-r">
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
