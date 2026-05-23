import { Tag } from './tagsApi';
import { X } from 'lucide-react';

interface TagBadgeProps {
  tag: Tag;
  onRemove?: (tagId: string) => void;
  className?: string;
}

export function TagBadge({ tag, onRemove, className = '' }: TagBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium shadow-sm transition-colors ${className}`}
      style={{
        backgroundColor: `${tag.color}20`,
        color: tag.color,
        border: `1px solid ${tag.color}40`
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(tag.id);
          }}
          className="hover:bg-black/10 rounded-full p-0.5 transition-colors focus:outline-none"
          aria-label={`Retirer ${tag.name}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
