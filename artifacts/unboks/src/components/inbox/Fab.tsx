import { Pencil } from "lucide-react";

interface FabProps {
  onClick?: () => void;
}

export function Fab({ onClick }: FabProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Compose"
      className="fixed bottom-20 right-4 h-14 pl-4 pr-5 bg-[#c2e7ff] hover:bg-[#a8d8f5] active:bg-[#8ec8ee] text-[#001d35] rounded-2xl shadow-lg flex items-center gap-3 transition-colors"
    >
      <Pencil className="w-5 h-5" strokeWidth={2} />
      <span className="text-[15px] font-medium">Compose</span>
    </button>
  );
}
