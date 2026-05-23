import { useState, useRef, useEffect } from 'react';
import { Tag, useTags, useCreateTag } from './tagsApi';
import { TagBadge } from './TagBadge';
import { Plus, Loader2 } from 'lucide-react';

interface TagSelectorProps {
  workspaceId: string;
  selectedTags: Tag[];
  onAssignTag: (tag: Tag) => void;
  onRemoveTag: (tagId: string) => void;
  disabled?: boolean;
}

export function TagSelector({ workspaceId, selectedTags, onAssignTag, onRemoveTag, disabled }: TagSelectorProps) {
  const { data: availableTags, isLoading: isLoadingTags } = useTags(workspaceId);
  const createTag = useCreateTag();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unselectedTags = (availableTags || []).filter(
    (tag) => !selectedTags.find((st) => st.id === tag.id)
  );

  const filteredTags = unselectedTags.filter((tag) =>
    tag.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!workspaceId || !search.trim()) return;
    try {
      const newTag = await createTag.mutateAsync({ workspaceId, name: search.trim() });
      onAssignTag(newTag);
      setSearch('');
      setIsOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedTags.map((tag) => (
          <TagBadge 
            key={tag.id} 
            tag={tag} 
            onRemove={disabled ? undefined : onRemoveTag} 
          />
        ))}
      </div>
      
      {!disabled && workspaceId && (
        <div className="relative">
          <input
            type="text"
            placeholder="Ajouter un tag..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
          />
          {isOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
              {isLoadingTags ? (
                <div className="p-3 text-center text-gray-500 flex justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <>
                  {filteredTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                      onClick={(e) => {
                        e.preventDefault();
                        onAssignTag(tag);
                        setSearch('');
                        setIsOpen(false);
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </button>
                  ))}
                  {search.trim() && filteredTags.length === 0 && (
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                      onClick={(e) => {
                        e.preventDefault();
                        handleCreate();
                      }}
                      disabled={createTag.isPending}
                    >
                      {createTag.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Créer le tag "{search.trim()}"
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
