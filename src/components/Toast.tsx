import { useEffect } from "react";

interface Props {
  show: boolean;
  message: string;
  onDismiss: () => void;
}

export function Toast({ show, message, onDismiss }: Props) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDismiss, 2400);
    return () => clearTimeout(t);
  }, [show, onDismiss]);
  if (!show) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-softIn">
      <div className="bg-ink text-canvas px-4 py-3 rounded-tile shadow-card text-sm">
        {message}
      </div>
    </div>
  );
}
