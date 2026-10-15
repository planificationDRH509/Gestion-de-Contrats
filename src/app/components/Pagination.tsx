export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav className="pagination" aria-label="Pagination des contrats">
      <span className="helper-text" role="status">
        Page {page} / {totalPages} · {total} contrats
      </span>
      {pageSizeOptions?.length && onPageSizeChange ? (
        <label className="pagination-size-select">
          <span>Par page</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Contrats par page"
          >
            {pageSizeOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="button" className="btn btn-outline pagination-edge" aria-label="Première page" title="Première page"
        onClick={() => onPageChange(1)} disabled={page <= 1}>
        <span className="material-symbols-rounded" aria-hidden="true">first_page</span>
      </button>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        Précédent
      </button>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Suivant
      </button>
      <button type="button" className="btn btn-outline pagination-edge" aria-label="Dernière page" title="Dernière page"
        onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>
        <span className="material-symbols-rounded" aria-hidden="true">last_page</span>
      </button>
    </nav>
  );
}
