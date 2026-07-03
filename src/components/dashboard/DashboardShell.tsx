import { useState } from "react";
import MealGenerator from "@/components/meal/MealGenerator";
import PantryWidget from "@/components/pantry/PantryWidget";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { PantryProduct } from "@/types";

interface DashboardShellProps {
  initialItems: PantryProduct[];
  loadError: boolean;
}

const columnHeaderClass = cn("hidden shrink-0 border-b border-border bg-card/60 px-5 py-3.5 md:block");

const tabsListClass = cn("h-auto w-full shrink-0 rounded-none border-b border-border bg-muted/25 px-3 py-2.5");

const tabsTriggerClass = cn(
  "flex-1 rounded-lg py-2 text-xs font-medium text-muted-foreground",
  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
);

function ColumnHeader({ title }: { title: string }) {
  return (
    <div className={columnHeaderClass}>
      <h2 className="text-foreground/70 flex items-center gap-2.5 text-xs font-semibold tracking-[0.12em] uppercase">
        <span className="bg-primary h-3 w-0.5 rounded-full" />
        {title}
      </h2>
    </div>
  );
}

function PantryPanel({
  initialItems,
  loadError,
  onItemsChange,
}: {
  initialItems: PantryProduct[];
  loadError: boolean;
  onItemsChange: (count: number) => void;
}) {
  return (
    <div className="border-border bg-background flex min-h-0 flex-1 flex-col border-b md:border-r md:border-b-0">
      <ColumnHeader title="Spiżarnia" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <PantryWidget initialItems={initialItems} loadError={loadError} onItemsChange={onItemsChange} />
      </div>
    </div>
  );
}

function GeneratorPanel({ loadError, pantryCount }: { loadError: boolean; pantryCount: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ColumnHeader title="Generator posiłków" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <MealGenerator loadError={loadError} pantryCount={pantryCount} />
      </div>
    </div>
  );
}

export default function DashboardShell({ initialItems, loadError }: DashboardShellProps) {
  const [pantryCount, setPantryCount] = useState(() => initialItems.length);
  const [mobileTab, setMobileTab] = useState("pantry");

  function handleItemsChange(count: number) {
    setPantryCount(count);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs value={mobileTab} onValueChange={setMobileTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className={cn(tabsListClass, "md:hidden")}>
          <TabsTrigger value="pantry" className={tabsTriggerClass}>
            Spiżarnia
          </TabsTrigger>
          <TabsTrigger value="generator" className={tabsTriggerClass}>
            Generator posiłków
          </TabsTrigger>
        </TabsList>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className={cn("flex min-h-0 flex-col", mobileTab !== "pantry" && "hidden md:flex")}>
            <PantryPanel initialItems={initialItems} loadError={loadError} onItemsChange={handleItemsChange} />
          </div>
          <div className={cn("flex min-h-0 flex-col", mobileTab !== "generator" && "hidden md:flex")}>
            <GeneratorPanel loadError={loadError} pantryCount={pantryCount} />
          </div>
        </div>
      </Tabs>
    </div>
  );
}
