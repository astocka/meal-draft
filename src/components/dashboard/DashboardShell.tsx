import { useState } from "react";
import PantryWidget from "@/components/pantry/PantryWidget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { PantryProduct } from "@/types";

interface DashboardShellProps {
  initialItems: PantryProduct[];
  loadError: boolean;
}

const columnHeaderClass = cn(
  "hidden shrink-0 border-b border-white/10 px-5 py-3 text-sm font-semibold tracking-widest text-white/40 uppercase md:block",
);

const tabsListClass = cn("h-auto w-full shrink-0 rounded-none border-b border-white/10 bg-white/5 p-1");

const tabsTriggerClass = cn(
  "flex-1 rounded-md text-white/60 data-[state=active]:bg-purple-600/25 data-[state=active]:text-white",
);

function ColumnHeader({ title }: { title: string }) {
  return (
    <div className={columnHeaderClass}>
      <h2>{title}</h2>
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
    <div className="flex min-h-0 flex-1 flex-col border-b border-white/10 md:border-r md:border-b-0">
      <ColumnHeader title="Spiżarnia" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <PantryWidget initialItems={initialItems} loadError={loadError} onItemsChange={onItemsChange} />
      </div>
    </div>
  );
}

function GeneratorShell() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ColumnHeader title="Generator posiłków" />
      <div className="shrink-0 px-5 py-4">
        <p className="text-sm text-white/40">Wybierz typ posiłku i czas — formularz pojawi się w następnym kroku.</p>
      </div>
    </div>
  );
}

export default function DashboardShell({ initialItems, loadError }: DashboardShellProps) {
  const [pantryCount, setPantryCount] = useState(() => initialItems.length);

  function handleItemsChange(count: number) {
    setPantryCount(count);
  }

  return (
    <div
      className="dark text-foreground flex min-h-0 flex-1 flex-col"
      data-pantry-count={pantryCount}
      data-load-error={loadError || undefined}
    >
      <Tabs defaultValue="pantry" className="flex min-h-0 flex-1 flex-col md:hidden">
        <TabsList variant="line" className={tabsListClass}>
          <TabsTrigger value="pantry" className={tabsTriggerClass}>
            Spiżarnia
          </TabsTrigger>
          <TabsTrigger value="generator" className={tabsTriggerClass}>
            Generator posiłków
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pantry" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <PantryPanel initialItems={initialItems} loadError={loadError} onItemsChange={handleItemsChange} />
        </TabsContent>
        <TabsContent value="generator" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <GeneratorShell />
        </TabsContent>
      </Tabs>

      <div className="hidden min-h-0 flex-1 md:grid md:grid-cols-2">
        <PantryPanel initialItems={initialItems} loadError={loadError} onItemsChange={handleItemsChange} />
        <GeneratorShell />
      </div>
    </div>
  );
}
