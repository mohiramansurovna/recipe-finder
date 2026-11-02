import { useEffect, useState, type FormEvent } from "react";

import {
  fetchIngredientVocabulary,
  parseIngredients,
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
  const [errorMessage, setErrorMessage] = useState("");

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsParsing(true);
    try {
      setCriteria(await parseIngredients(text));
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

      <p className="search-note" role="status">
        Recipe results will be available in the next search release.
      </p>

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
