import { useState, useRef, useEffect, useMemo } from 'react';

export interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  searchable?: boolean;
  fullWidth?: boolean;
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function MultiSelectDropdown({ label, options, selectedValues, onChange, placeholder, searchable = false, fullWidth = false }: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uniqueOptions = useMemo(() => [...new Set(options)], [options]);

  const visibleOptions = useMemo(() => {
    const tokens = searchable ? normalizeSearch(searchQuery).split(/\s+/).filter(Boolean) : [];
    if (tokens.length === 0) return uniqueOptions;
    return uniqueOptions.filter(option => {
      const normalizedOption = normalizeSearch(option);
      return tokens.every(token => normalizedOption.includes(token));
    });
  }, [uniqueOptions, searchQuery, searchable]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const selectAll = () => {
    onChange([...new Set([...selectedValues, ...visibleOptions])]);
  };

  const selectNone = () => {
    onChange(searchable && normalizeSearch(searchQuery)
      ? selectedValues.filter(value => !visibleOptions.includes(value))
      : []);
  };

  const displayText = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (uniqueOptions.length > 0 && selectedValues.length === uniqueOptions.length && uniqueOptions.every(value => selectedValues.includes(value))) return "Toutes";
    if (selectedValues.length <= 2) return selectedValues.join(", ");
    return `${selectedValues.length} sélectionné(s)`;
  }, [selectedValues, uniqueOptions, placeholder]);

  return (
    <div ref={containerRef} className="multi-select-field" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}
      onKeyDown={event => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}
    >
      <label style={{ fontSize: '13px', color: 'var(--ink-muted)', fontWeight: 600 }}>{label}</label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setSearchQuery(''); setIsOpen(!isOpen); }}
        aria-expanded={isOpen}
        className="accent-select"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '38px',
          minWidth: fullWidth ? 0 : '220px',
          maxWidth: fullWidth ? '100%' : '300px',
          width: fullWidth ? '100%' : undefined,
          textAlign: 'left',
          background: 'var(--surface-card)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '0 16px',
          cursor: 'pointer',
          color: selectedValues.length > 0 ? 'var(--ink)' : 'var(--ink-muted)',
          fontSize: '13.5px',
          fontWeight: selectedValues.length > 0 ? '700' : '500',
          outline: 'none',
          transition: 'all 0.25s ease'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
          {displayText}
        </span>
        <span className="material-symbols-rounded" style={{ fontSize: '18px', color: 'var(--ink-muted)' }}>
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isOpen && (
        <div className="multi-select-menu" style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          zIndex: 999,
          width: '280px',
          maxHeight: '300px',
          background: 'var(--surface-card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-premium)',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          animation: 'slideUpAndFade 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {searchable && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span
                className="material-symbols-rounded"
                aria-hidden="true"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: 'var(--ink-muted)', pointerEvents: 'none' }}
              >
                search
              </span>
              <input
                type="search"
                className="input"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Rechercher…"
                aria-label={`Rechercher dans ${label}`}
                autoComplete="off"
                autoFocus
                style={{ height: '36px', minHeight: '36px', padding: '6px 10px 6px 34px', borderRadius: '10px', fontSize: '13px' }}
              />
            </div>
          )}

          {/* Quick Select Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <button 
              type="button" 
              onClick={selectAll} 
              style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: '11px', fontWeight: '800', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
            >
              Toutes
            </button>
            <button 
              type="button" 
              onClick={selectNone} 
              style={{ background: 'transparent', border: 'none', color: 'var(--ink-muted)', fontSize: '11px', fontWeight: '800', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
            >
              Aucun
            </button>
          </div>

          {/* Options List */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minHeight: 0, paddingRight: '4px' }}>
            {visibleOptions.length === 0 && searchable && (
              <div role="status" style={{ padding: '8px 10px', color: 'var(--ink-muted)', fontSize: '13px' }}>Aucun résultat</div>
            )}
            {visibleOptions.map(option => {
              const isSelected = selectedValues.includes(option);
              return (
                <label 
                  key={option} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: isSelected ? '700' : '500',
                    color: isSelected ? 'var(--ink)' : 'var(--ink-muted)',
                    background: isSelected ? 'var(--surface-sunken)' : 'transparent',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if(!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; }}
                  onMouseLeave={(e) => { if(!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOption(option)}
                    style={{
                      accentColor: 'var(--accent)',
                      cursor: 'pointer',
                      width: '15px',
                      height: '15px'
                    }}
                  />
                  <span title={option} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
