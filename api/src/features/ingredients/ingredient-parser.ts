export interface IngredientParseResult {
  included: string[];
  excluded: string[];
  unrecognized: string[];
}

interface IngredientPhrase {
  name: string;
  words: string[];
}

const NEGATION_WORDS = new Set(["no", "not", "without"]);
const FILLER_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "got",
  "have",
  "i",
  "ingredients",
  "me",
  "my",
  "of",
  "or",
  "please",
  "some",
  "the",
  "there",
  "with",
]);

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function buildVocabularyIndex(vocabulary: ReadonlySet<string> | readonly string[]) {
  const index = new Map<string, IngredientPhrase[]>();
  const names = new Set(vocabulary);

  for (const rawName of names) {
    const name = rawName.trim().toLowerCase();
    const words = tokenize(name);
    if (!name || words.length === 0) continue;

    const firstWord = words[0];
    if (!firstWord) continue;

    const phrases = index.get(firstWord) ?? [];
    phrases.push({ name, words });
    index.set(firstWord, phrases);
  }

  for (const phrases of index.values()) {
    phrases.sort((left, right) => {
      if (left.words.length !== right.words.length) {
        return right.words.length - left.words.length;
      }
      return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
    });
  }

  return index;
}

function matchIngredient(
  words: readonly string[],
  start: number,
  vocabularyIndex: ReadonlyMap<string, readonly IngredientPhrase[]>,
): IngredientPhrase | undefined {
  const firstWord = words[start];
  if (!firstWord) return undefined;

  for (const phrase of vocabularyIndex.get(firstWord) ?? []) {
    if (phrase.words.every((word, offset) => words[start + offset] === word)) {
      return phrase;
    }
  }

  return undefined;
}

export function parseIngredientText(
  text: string,
  vocabulary: ReadonlySet<string> | readonly string[],
): IngredientParseResult {
  const words = tokenize(text);
  const vocabularyIndex = buildVocabularyIndex(vocabulary);
  const categories = new Map<string, "included" | "excluded">();
  const unrecognized = new Set<string>();

  for (let index = 0; index < words.length;) {
    const word = words[index];
    if (!word) break;

    if (NEGATION_WORDS.has(word)) {
      const excludedMatch = matchIngredient(words, index + 1, vocabularyIndex);
      if (excludedMatch) {
        categories.set(excludedMatch.name, "excluded");
        index += excludedMatch.words.length + 1;
        continue;
      }
      index += 1;
      continue;
    }

    const ingredient = matchIngredient(words, index, vocabularyIndex);
    if (ingredient) {
      categories.set(ingredient.name, "included");
      index += ingredient.words.length;
      continue;
    }

    if (!FILLER_WORDS.has(word)) unrecognized.add(word);
    index += 1;
  }

  return {
    included: [...categories]
      .filter(([, category]) => category === "included")
      .map(([name]) => name),
    excluded: [...categories]
      .filter(([, category]) => category === "excluded")
      .map(([name]) => name),
    unrecognized: [...unrecognized],
  };
}
