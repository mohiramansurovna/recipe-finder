export function IngredientGroup({
  title,
  ingredients,
  onRemove,
  onToggle,
  toggleLabel,
}: {
  title: string;
  ingredients: string[];
  onRemove: (ingredient: string) => void;
  onToggle?: (ingredient: string) => void;
  toggleLabel?: string;
}) {
  return (
    <section className="ingredient-group" aria-label={title}>
      <h2>{title}</h2>
      {ingredients.length === 0 ? (
        <p className="empty-group">None</p>
      ) : (
        <ul className="chip-list">
          {ingredients.map((ingredient) => (
            <li className="chip" key={ingredient}>
              <span>{ingredient}</span>
              {onToggle && toggleLabel && (
                <button
                  type="button"
                  aria-label={`Move ${ingredient} to ${
                    toggleLabel === "Exclude" ? "excluded" : "included"
                  }`}
                  onClick={() => onToggle(ingredient)}
                >
                  {toggleLabel}
                </button>
              )}
              <button
                type="button"
                aria-label={`Remove ${ingredient}`}
                onClick={() => onRemove(ingredient)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
