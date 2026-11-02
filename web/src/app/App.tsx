import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  fetchFilterOptions,
  fetchIngredientVocabulary,
  parseIngredients,
  searchRecipes,
  type RecipeSearchPage,
} from "../features/ingredients/api.js";
import { IngredientAutocomplete } from "../features/ingredients/components/IngredientAutocomplete.js";
import { IngredientGroup } from "../features/ingredients/components/IngredientGroup.js";
import type { IngredientCriteria } from "../features/ingredients/ingredient-types.js";
import "../features/ingredients/ingredients.css";
import "../styles/global.css";

const emptyCriteria: IngredientCriteria = {
  included: [],
  excluded: [],
  excludedCategories: [],
  unrecognized: [],
};

const vegetarianExclusions = ["meat", "fish/seafood"];

export default function App() {
  const [text, setText] = useState("");
  const [criteria, setCriteria] = useState(emptyCriteria);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState({
    categories: [] as string[],
    cuisines: [] as string[],
  });
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [isLoadingVocabulary, setIsLoadingVocabulary] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [recipePage, setRecipePage] = useState<RecipeSearchPage>({
    recipes: [],
    nextCursor: null,
  });
  const [pageCriteriaKey, setPageCriteriaKey] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchError, setSearchError] = useState("");
  const searchControllerRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const criteriaKey = JSON.stringify([
    criteria.included,
    criteria.excluded,
    criteria.excludedCategories,
    selectedCuisines,
    maxMinutes,
  ]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchIngredientVocabulary(), fetchFilterOptions()])
      .then(([ingredients, options]) => {
        if (active) {
          setVocabulary(ingredients);
          setFilterOptions(options);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "Could not load ingredients.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingVocabulary(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!searchEnabled) return;

    const controller = new AbortController();
    searchControllerRef.current = controller;
    loadingMoreRef.current = false;
    setIsLoadingMore(false);
    setRecipePage({ recipes: [], nextCursor: null });
    setPageCriteriaKey(null);
    setIsSearching(true);
    setSearchError("");
    searchRecipes(
      { ...criteria, cuisines: selectedCuisines },
      maxMinutes,
      null,
      controller.signal,
    )
      .then((page) => {
        if (!controller.signal.aborted) {
          setRecipePage(page);
          setPageCriteriaKey(criteriaKey);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSearchError(
            error instanceof Error ? error.message : "Could not load recipes.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSearching(false);
      });

    return () => {
      controller.abort();
      if (searchControllerRef.current === controller) searchControllerRef.current = null;
    };
  }, [criteria, criteriaKey, maxMinutes, searchEnabled, searchRetry, selectedCuisines]);

  const loadMore = useCallback(async () => {
    const cursor = recipePage.nextCursor;
    const controller = searchControllerRef.current;
    if (
      cursor === null ||
      controller === null ||
      pageCriteriaKey !== criteriaKey ||
      loadingMoreRef.current
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setSearchError("");
    try {
      const page = await searchRecipes(
        { ...criteria, cuisines: selectedCuisines },
        maxMinutes,
        cursor,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setRecipePage((current) => {
          const knownIds = new Set(current.recipes.map((recipe) => recipe.id));
          return {
            recipes: [
              ...current.recipes,
              ...page.recipes.filter((recipe) => !knownIds.has(recipe.id)),
            ],
            nextCursor: page.nextCursor,
          };
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSearchError(
          error instanceof Error ? error.message : "Could not load more recipes.",
        );
      }
    } finally {
      if (searchControllerRef.current === controller) {
        loadingMoreRef.current = false;
        if (!controller.signal.aborted) setIsLoadingMore(false);
      }
    }
  }, [
    criteria,
    criteriaKey,
    maxMinutes,
    pageCriteriaKey,
    recipePage.nextCursor,
    selectedCuisines,
  ]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (
      !searchEnabled ||
      recipePage.nextCursor === null ||
      pageCriteriaKey !== criteriaKey ||
      sentinel === null ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [criteriaKey, loadMore, pageCriteriaKey, recipePage.nextCursor, searchEnabled]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsParsing(true);
    try {
      setCriteria(await parseIngredients(text));
      setSearchEnabled(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not interpret ingredients.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  function removeIngredient(ingredient: string) {
    setCriteria((current) => ({
      ...current,
      included: current.included.filter((name) => name !== ingredient),
      excluded: current.excluded.filter((name) => name !== ingredient),
      unrecognized: current.unrecognized.filter((name) => name !== ingredient),
    }));
  }

  function toggleIngredient(ingredient: string, from: "included" | "excluded") {
    setCriteria((current) => {
      const source = current[from];
      const target = from === "included" ? "excluded" : "included";
      return {
        ...current,
        [from]: source.filter((name) => name !== ingredient),
        [target]: [...current[target], ingredient],
      };
    });
  }

  function addIngredient(ingredient: string) {
    setCriteria((current) => ({
      ...current,
      included: current.included.includes(ingredient)
        ? current.included
        : [...current.included, ingredient],
      excluded: current.excluded.filter((name) => name !== ingredient),
      unrecognized: current.unrecognized.filter((name) => name !== ingredient),
    }));
  }

  function toggleCategory(category: string) {
    setCriteria((current) => ({
      ...current,
      excludedCategories: current.excludedCategories.includes(category)
        ? current.excludedCategories.filter((name) => name !== category)
        : [...current.excludedCategories, category],
    }));
  }

  function toggleVegetarianExclusions() {
    setCriteria((current) => {
      const hasPreset = vegetarianExclusions.every((category) =>
        current.excludedCategories.includes(category),
      );
      return {
        ...current,
        excludedCategories: hasPreset
          ? current.excludedCategories.filter(
              (category) => !vegetarianExclusions.includes(category),
            )
          : [
              ...new Set([
                ...current.excludedCategories,
                ...vegetarianExclusions,
              ]),
            ],
      };
    });
  }

  function toggleCuisine(cuisine: string) {
    setSelectedCuisines((current) =>
      current.includes(cuisine)
        ? current.filter((name) => name !== cuisine)
        : [...current, cuisine],
    );
  }

  const availableIngredients = vocabulary.filter(
    (ingredient) =>
      !criteria.included.includes(ingredient) &&
      !criteria.excluded.includes(ingredient),
  );

  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">Ingredient-first recipe discovery</p>
        <h1>Find something to cook</h1>
        <p>Tell us what you have. Review the ingredients we understood.</p>
      </header>

      <form className="search-form" onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="ingredient-text">Ingredients you have</label>
        <textarea
          id="ingredient-text"
          rows={3}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder="For example: chicken, rice, spinach, no butter"
        />
        <button type="submit" disabled={isParsing}>
          {isParsing ? "Interpreting…" : "Interpret ingredients"}
        </button>
      </form>

      {errorMessage && (
        <p className="error-message" role="alert">
          {errorMessage}
        </p>
      )}

      <section className="criteria" aria-label="Ingredient criteria">
        <IngredientGroup
          title="Included"
          ingredients={criteria.included}
          onRemove={removeIngredient}
          onToggle={(ingredient) => toggleIngredient(ingredient, "included")}
          toggleLabel="Exclude"
        />
        <IngredientGroup
          title="Excluded"
          ingredients={criteria.excluded}
          onRemove={removeIngredient}
          onToggle={(ingredient) => toggleIngredient(ingredient, "excluded")}
          toggleLabel="Include"
        />
        <IngredientGroup
          title="Not recognized"
          ingredients={criteria.unrecognized}
          onRemove={removeIngredient}
        />
      </section>

      <IngredientAutocomplete
        ingredients={availableIngredients}
        isLoading={isLoadingVocabulary}
        onAdd={addIngredient}
      />

      <section className="recipe-search-results" aria-label="Recipe results">
        <div className="search-filters">
          <fieldset className="filter-fieldset" disabled={isLoadingVocabulary}>
            <legend>Exclude ingredient categories</legend>
            <button
              type="button"
              className="vegetarian-preset"
              aria-pressed={vegetarianExclusions.every((category) =>
                criteria.excludedCategories.includes(category),
              )}
              onClick={toggleVegetarianExclusions}
            >
              Vegetarian
            </button>
            <div className="category-chip-list" role="group" aria-label="Categories">
              {filterOptions.categories.map((category) => {
                const isExcluded = criteria.excludedCategories.includes(category);
                return (
                  <button
                    type="button"
                    className={isExcluded ? "filter-chip selected" : "filter-chip"}
                    key={category}
                    aria-pressed={isExcluded}
                    onClick={() => toggleCategory(category)}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="filter-fieldset" disabled={isLoadingVocabulary}>
            <legend>Filter by cuisine</legend>
            {filterOptions.cuisines.length === 0 ? (
              <p className="empty-group">No cuisine filters available.</p>
            ) : (
              <>
                <div className="cuisine-options">
                  {filterOptions.cuisines.map((cuisine) => (
                    <label key={cuisine}>
                      <input
                        type="checkbox"
                        checked={selectedCuisines.includes(cuisine)}
                        onChange={() => toggleCuisine(cuisine)}
                      />
                      {cuisine}
                    </label>
                  ))}
                </div>
                {selectedCuisines.length > 0 && (
                  <button
                    type="button"
                    className="clear-cuisines"
                    onClick={() => setSelectedCuisines([])}
                  >
                    Clear cuisine filters
                  </button>
                )}
              </>
            )}
          </fieldset>
        </div>

        <div className="time-filter">
          <label htmlFor="max-cooking-time">Maximum cooking time</label>
          <select
            id="max-cooking-time"
            value={maxMinutes ?? ""}
            onChange={(event) =>
              setMaxMinutes(
                event.currentTarget.value === ""
                  ? null
                  : Number(event.currentTarget.value),
              )
            }
          >
            <option value="">Any time</option>
            <option value="15">Up to 15 minutes</option>
            <option value="30">Up to 30 minutes</option>
            <option value="60">Up to 60 minutes</option>
          </select>
        </div>

        {isSearching && (
          <p className="search-note" role="status">
            Searching recipes…
          </p>
        )}
        {isLoadingMore && (
          <p className="search-note" role="status">
            Loading more recipes…
          </p>
        )}
        {searchError && (
          <div className="error-message" role="alert">
            <p>{searchError}</p>
            <button type="button" onClick={() => setSearchRetry((count) => count + 1)}>
              Retry recipe search
            </button>
          </div>
        )}
        {searchEnabled &&
          !isSearching &&
          !searchError &&
          recipePage.recipes.length === 0 && (
            <p className="search-note" role="status">
              No recipes match these criteria.
            </p>
          )}
        <div className="recipe-list">
          {recipePage.recipes.map((recipe) => (
            <article className="recipe-card" key={recipe.id}>
              <h2>{recipe.name}</h2>
              <p className="recipe-time">
                {recipe.minutes === null
                  ? "Cooking time unknown"
                  : `${recipe.minutes} minutes`}
              </p>
              <div>
                <h3>Matched ingredients</h3>
                <p>{recipe.matchedIngredients.join(", ") || "None"}</p>
              </div>
              <div>
                <h3>Missing ingredients</h3>
                <p>{recipe.missingIngredients.join(", ") || "None"}</p>
              </div>
              {recipe.excludedIngredients.length > 0 && (
                <div>
                  <h3>Contains excluded ingredients</h3>
                  <p>{recipe.excludedIngredients.join(", ")}</p>
                </div>
              )}
            </article>
          ))}
        </div>
        {recipePage.nextCursor !== null && pageCriteriaKey === criteriaKey && (
          <>
            <button type="button" onClick={() => void loadMore()} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading…" : "Load more recipes"}
            </button>
            <div
              ref={loadMoreSentinelRef}
              className="load-more-sentinel"
              aria-hidden="true"
            />
          </>
        )}
      </section>

      <footer>
        Recipe data:{" "}
        <a href="https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions">
          Food.com Recipes and Interactions dataset
        </a>
        .
      </footer>
    </main>
  );
}
