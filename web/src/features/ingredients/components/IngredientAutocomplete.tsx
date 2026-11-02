import { useState, type KeyboardEvent } from "react";

export function IngredientAutocomplete({
  ingredients,
  isLoading,
  onAdd,
}: {
  ingredients: string[];
  isLoading: boolean;
  onAdd: (ingredient: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = query.trim()
    ? ingredients
        .filter((ingredient) =>
          ingredient.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];
  const activeIngredient = matches[activeIndex];

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      return;
    }

    if (matches.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter" && activeIngredient) {
      event.preventDefault();
      onAdd(activeIngredient);
      setQuery("");
      setActiveIndex(0);
    }
  }

  function selectIngredient(ingredient: string) {
    onAdd(ingredient);
    setQuery("");
    setActiveIndex(0);
  }

  return (
    <section className="add-ingredient" aria-label="Add an ingredient">
      <label htmlFor="ingredient-search">Search recognized ingredients</label>
      <div className="ingredient-autocomplete">
        <input
          id="ingredient-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? "Loading ingredients…" : "Type to filter ingredients"}
          disabled={isLoading || ingredients.length === 0}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={query.trim().length > 0 && matches.length > 0}
          aria-controls="ingredient-suggestions"
          aria-activedescendant={
            activeIngredient ? `ingredient-option-${activeIndex}` : undefined
          }
        />
        {query.trim() && matches.length > 0 && (
          <ul
            className="ingredient-suggestions"
            id="ingredient-suggestions"
            role="listbox"
            aria-label="Matching ingredients"
          >
            {matches.map((ingredient, index) => (
              <li
                className={activeIndex === index ? "suggestion active" : "suggestion"}
                id={`ingredient-option-${index}`}
                key={ingredient}
                role="option"
                aria-selected={activeIndex === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectIngredient(ingredient)}
              >
                {ingredient}
              </li>
            ))}
          </ul>
        )}
      </div>
      {query.trim() && matches.length === 0 && (
        <p className="empty-group" role="status">No matching ingredients.</p>
      )}
    </section>
  );
}
