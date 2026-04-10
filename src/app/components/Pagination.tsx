export function Pagination({
  page,
  pageSize,
  total,
  onPageChange
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="pagination">
      <span className="helper-text">
        Page {page} / {totalPages} · {total} contrats
      </span>
      <button
        className="btn btn-outline"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        Précédent
      </button>
      <button
        className="btn btn-outline"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Suivant
      </button>
    </div>
  );
}
