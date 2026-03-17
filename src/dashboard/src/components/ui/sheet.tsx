import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";
import { X } from "lucide-react";

interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SheetContext = createContext<SheetContextValue>({
  open: false,
  onOpenChange: () => {},
});

export function Sheet({
  open: controlledOpen,
  onOpenChange: controlledOnChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const onOpenChange = controlledOnChange ?? setInternalOpen;

  return (
    <SheetContext.Provider value={{ open, onOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
}

export function SheetTrigger({
  children,
  asChild: _asChild,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { onOpenChange } = useContext(SheetContext);
  return (
    <button
      className={className}
      onClick={() => onOpenChange(true)}
      {...props}
    >
      {children}
    </button>
  );
}

export const SheetContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { side?: "left" | "right" }
>(({ className, side = "left", children, ...props }, ref) => {
  const { open, onOpenChange } = useContext(SheetContext);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, handleEscape]);

  if (!open) return null;

  const sideClasses =
    side === "left"
      ? "left-0 border-r"
      : "right-0 border-l";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={() => onOpenChange(false)}
        data-testid="sheet-overlay"
      />
      <div
        ref={ref}
        className={cn(
          "fixed top-0 z-50 h-full w-[280px] border-zinc-800 bg-zinc-900 p-6 shadow-lg",
          sideClasses,
          className,
        )}
        {...props}
      >
        {children}
        <button
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 text-zinc-400"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );
});
SheetContent.displayName = "SheetContent";

export function useSheet() {
  return useContext(SheetContext);
}
