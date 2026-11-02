import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
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
  unrecognized: [],
};

export default function App() {
  const [text, setText] = useState("");
  const [criteria, setCriteria] = useState(emptyCriteria);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
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
    maxMinutes,
  ]);

  useEffect(() => {
    let active = true;
    fetchIngredientVocabulary()
      .then((ingredients) => {
        if (active) setVocabulary(ingredients);
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
    searchRecipes(criteria, maxMinutes, null, controller.signal)
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
  }, [criteria, criteriaKey, maxMinutes, searchEnabled, searchRetry]);

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
      const page = await searchRecipes(criteria, maxMinutes, cursor, controller.signal);
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
  }, [criteria, criteriaKey, maxMinutes, pageCriteriaKey, recipePage.nextCursor]);

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
      included: current.included.includes(ingredient)
        ? current.included
        : [...current.included, ingredient],
      excluded: current.excluded.filter((name) => name !== ingredient),
      unrecognized: current.unrecognized.filter((name) => name !== ingredient),
    }));
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
