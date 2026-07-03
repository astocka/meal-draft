import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const inputBase =
  "w-full rounded-xl bg-input border border-border/60 px-3 py-3 pl-10 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:border-ring/50 transition-colors text-sm";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-foreground/70 mb-1.5 block text-xs font-medium tracking-wide">
        {label}
      </label>
      <div className="relative">
        <span className="text-muted-foreground/60 absolute top-1/2 left-3.5 size-4 -translate-y-1/2">{icon}</span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          className={cn(
            inputBase,
            error ? "border-destructive focus:ring-destructive" : "border-border focus:ring-ring",
          )}
        />
        {endContent}
      </div>
      {error ? (
        <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
