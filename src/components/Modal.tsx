import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { Card } from "./Card";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** max-width Tailwind class, e.g. "max-w-lg" */
  widthClass?: string;
}

export function Modal({ open, onClose, title, children, widthClass = "max-w-lg" }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-sm animate-softIn">
      <Card className={`w-full ${widthClass} p-6 relative`}>
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted hover:text-ink"
        >
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold text-ink mb-4">{title}</h2>
        {children}
      </Card>
    </div>
  );
}
