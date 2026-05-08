import { cn } from '@/lib/helpers';

interface CandidateCardProps {
  name: string;
  position: string;
  department: string;
  imageUrl?: string;
  isSelected?: boolean;
  onSelect?: () => void;
}

export default function CandidateCard({
  name,
  position,
  department,
  isSelected = false,
  onSelect,
}: CandidateCardProps) {
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase();

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full p-6 rounded-2xl border text-left transition-all',
        isSelected
          ? 'border-primary-500 bg-primary-500/10 shadow-lg shadow-primary-500/10'
          : 'border-surface-700 bg-surface-900/50 hover:border-surface-600 hover:bg-surface-900'
      )}
    >
      <div className="flex items-center gap-4 mb-3">
        <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-white font-bold">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-surface-100">{name}</p>
          <p className="text-xs text-surface-500">{department}</p>
        </div>
      </div>
      <p className="text-sm text-primary-400">{position}</p>
      {isSelected && (
        <div className="mt-3 text-xs text-primary-300 flex items-center gap-1">
          ✓ Selected
        </div>
      )}
    </button>
  );
}
