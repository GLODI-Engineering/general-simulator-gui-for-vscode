import { useMemo, useState } from "react";

import { useGraphStore, useUiStore } from "../store";
import { type SearchMatch, findInModel } from "./find-in-model";

const KIND_LABEL: Record<SearchMatch["kind"], string> = {
  block: "block",
  param: "param",
  wire: "wire",
  net: "net",
  annotation: "note",
};

export function SearchActivity() {
  const [query, setQuery] = useState("");
  const model = useGraphStore((state) => state.document.model);
  const results = useMemo(() => findInModel(model, query), [model, query]);
  const trimmed = query.trim();

  return (
    <section className="search-activity">
      <header className="search-activity__header">
        <input
          className="search-activity__input"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Find blocks, nets, params…"
          aria-label="Find in schematic"
        />
      </header>
      {trimmed && results.length === 0 ? (
        <p className="search-activity__empty">No match in this schematic.</p>
      ) : null}
      <ul className="search-activity__results" aria-label="Search results">
        {results.map((result) => (
          <li key={`${result.kind}:${result.id}:${result.detail}`}>
            <button
              type="button"
              className="search-activity__result"
              onClick={() => useUiStore.getState().setSelection([result.id])}
            >
              <span className="search-activity__kind">{KIND_LABEL[result.kind]}</span>
              <span className="search-activity__detail">{result.detail}</span>
              {result.detail === result.id ? null : (
                <span className="search-activity__id">{result.id}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SearchActivity;
