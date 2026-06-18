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
      className={`badge ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${tag.color} 20%, transparent)`,
        color: tag.color,
        borderColor: `color-mix(in srgb, ${tag.color} 40%, transparent)`,
        fontSize: "11px",
        padding: "2px 8px",
        fontWeight: 500,
        lineHeight: "1",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px"
      }}
    >
      <span className="material-symbols-rounded" style={{ fontSize: "14px" }}>sell</span>
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
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
