export function Pagination({ page, pageSize, total, noun, onPage }: { page: number; pageSize: number; total: number; noun: string; onPage: (p: number) => void }) {
  const start = page * pageSize;
  const end = Math.min(total, start + pageSize);
  const label = total === 1 ? noun.replace(/s$/, "") : noun;
  const range = start + 1 === end ? `${end}` : `${start + 1}–${end}`;
  return <div className="pagination"><span>{total === 0 ? `No ${noun} found` : `Showing ${range} of ${total} ${label}`}</span><div><button disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><button disabled={end >= total} onClick={() => onPage(page + 1)}>Next</button></div></div>;
}
