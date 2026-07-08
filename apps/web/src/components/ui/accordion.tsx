import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type AccordionContextValue = {
  openItems: ReadonlySet<string>;
  toggle: (value: string) => void;
};

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

function useAccordionContext(): AccordionContextValue {
  const ctx = React.useContext(AccordionContext);
  if (ctx === null) {
    throw new Error("Accordion components must be used within Accordion");
  }
  return ctx;
}

type AccordionProps = {
  type?: "single" | "multiple";
  defaultValue?: string | string[];
  children: React.ReactNode;
  className?: string;
};

function Accordion({
  type = "multiple",
  defaultValue,
  children,
  className,
}: AccordionProps): React.ReactElement {
  const [openItems, setOpenItems] = React.useState<Set<string>>(() => {
    if (defaultValue === undefined) {
      return new Set();
    }
    if (Array.isArray(defaultValue)) {
      return new Set(defaultValue);
    }
    return new Set([defaultValue]);
  });

  const toggle = React.useCallback(
    (value: string) => {
      setOpenItems((prev) => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
          return next;
        }
        if (type === "single") {
          return new Set([value]);
        }
        next.add(value);
        return next;
      });
    },
    [type],
  );

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div data-slot="accordion" className={cn("space-y-2", className)}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

type AccordionItemProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

function AccordionItem({ children, className }: AccordionItemProps): React.ReactElement {
  return (
    <div
      data-slot="accordion-item"
      data-state={undefined}
      className={cn("rounded-md border border-border bg-card", className)}
    >
      {children}
    </div>
  );
}

type AccordionTriggerProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

function AccordionTrigger({ value, children, className }: AccordionTriggerProps): React.ReactElement {
  const { openItems, toggle } = useAccordionContext();
  const open = openItems.has(value);

  return (
    <button
      type="button"
      data-slot="accordion-trigger"
      aria-expanded={open}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50",
        className,
      )}
      onClick={() => toggle(value)}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronDownIcon
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
          open ? "rotate-180" : "",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

type AccordionContentProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

function AccordionContent({ value, children, className }: AccordionContentProps): React.ReactElement {
  const { openItems } = useAccordionContext();
  const open = openItems.has(value);

  if (!open) {
    return <div className="hidden" />;
  }

  return (
    <div
      data-slot="accordion-content"
      className={cn("border-t border-border px-4 py-4", className)}
    >
      {children}
    </div>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
