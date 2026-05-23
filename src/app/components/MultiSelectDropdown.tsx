import { useState, useRef, useEffect, useMemo } from 'react';

export interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}

export function MultiSelectDropdown({ label, options, selectedValues, onChange, placeholder }: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    onChange([...options]);
  };

  const selectNone = () => {
    onChange([]);
  };

  const displayText = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === options.length) return "Toutes";
    if (selectedValues.length <= 2) return selectedValues.join(", ");
    return `${selectedValues.length} sélectionné(s)`;
  }, [selectedValues, options, placeholder]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '13px', color: 'var(--ink-muted)', fontWeight: 600 }}>{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="accent-select"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '38px',
          minWidth: '220px',
          maxWidth: '300px',
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
        <div style={{
          position: 'absolute',
          top: '46px',
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
          {/* Quick Select Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
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
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, paddingRight: '4px' }}>
            {options.map(option => {
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
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
