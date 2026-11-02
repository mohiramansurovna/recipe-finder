import type { IngredientAlias } from "./ingredient-repository.js";

export interface IngredientParseResult {
  included: string[];
  excluded: string[];
  unrecognized: string[];
}

interface IngredientPhrase {
  name: string;
  canonicalName: string;
  words: string[];
}

interface VocabularyIndex {
  byFirstWord: ReadonlyMap<string, readonly IngredientPhrase[]>;
  phrases: readonly IngredientPhrase[];
}

const NEGATION_WORDS = new Set(["no", "not", "without"]);
const FILLER_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "do",
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
  return value
    .toLowerCase()
    .replace(/\bdon['’]?t\b/gu, "do not")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function comparePhrases(left: IngredientPhrase, right: IngredientPhrase): number {
  if (left.words.length !== right.words.length) {
    return right.words.length - left.words.length;
  }
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.canonicalName < right.canonicalName
    ? -1
    : left.canonicalName > right.canonicalName
      ? 1
      : 0;
}

function buildVocabularyIndex(
  vocabulary: ReadonlySet<string> | readonly string[],
  aliases: readonly IngredientAlias[],
): VocabularyIndex {
  const phraseMap = new Map<string, IngredientPhrase>();
  const addPhrase = (name: string, canonicalName: string) => {
    const words = tokenize(name);
    if (words.length === 0) return;
    const key = `${name}\u0000${canonicalName}`;
    phraseMap.set(key, { name, canonicalName, words });
  };

  for (const rawName of new Set(vocabulary)) {
    const name = rawName.trim().toLowerCase();
    if (name) addPhrase(name, name);
  }
  for (const { alias, canonicalName: rawCanonicalName } of aliases) {
    const normalizedAlias = alias.trim().toLowerCase();
    const canonicalName = rawCanonicalName.trim().toLowerCase();
    if (normalizedAlias && canonicalName) addPhrase(normalizedAlias, canonicalName);
  }

  const phrases = [...phraseMap.values()].sort(comparePhrases);
  const byFirstWord = new Map<string, IngredientPhrase[]>();
  for (const phrase of phrases) {
    const firstWord = phrase.words[0];
    if (!firstWord) continue;
    const candidates = byFirstWord.get(firstWord) ?? [];
    candidates.push(phrase);
    byFirstWord.set(firstWord, candidates);
  }

  return { byFirstWord, phrases };
}

function matchExactIngredient(
  words: readonly string[],
  start: number,
  vocabularyIndex: VocabularyIndex,
): IngredientPhrase | undefined {
  const firstWord = words[start];
  if (!firstWord) return undefined;

  for (const phrase of vocabularyIndex.byFirstWord.get(firstWord) ?? []) {
    if (phrase.words.every((word, offset) => words[start + offset] === word)) {
      return phrase;
    }
  }

  return undefined;
}

function oneEditApart(left: string, right: string): boolean {
  if (left.length < 4 || right.length < 4 || Math.abs(left.length - right.length) > 1) {
    return false;
  }
  if (left === right) return true;

  if (left.length === right.length) {
    const differingPositions: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differingPositions.push(index);
      if (differingPositions.length > 2) return false;
    }
    if (differingPositions.length === 1) return true;
    if (differingPositions.length !== 2) return false;
    const first = differingPositions[0];
    const second = differingPositions[1];
    return (
      first !== undefined &&
      second === first + 1 &&
      left[first] === right[second] &&
      left[second] === right[first]
    );
  }

  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
      longIndex += 1;
    }
  }
  return true;
}

function matchTypoIngredient(
  words: readonly string[],
  start: number,
  vocabularyIndex: VocabularyIndex,
): IngredientPhrase | undefined {
  const matches: { phrase: IngredientPhrase; edits: number }[] = [];
  for (const phrase of vocabularyIndex.phrases) {
    if (phrase.words.length + start > words.length) continue;
    let edits = 0;
    let valid = true;
    for (let offset = 0; offset < phrase.words.length; offset += 1) {
      const inputWord = words[start + offset];
      const candidateWord = phrase.words[offset];
      if (inputWord === undefined || candidateWord === undefined) {
        valid = false;
        break;
      }
      if (inputWord === candidateWord) continue;
      if (edits > 0 || !oneEditApart(inputWord, candidateWord)) {
        valid = false;
        break;
      }
      edits += 1;
    }
    if (valid && edits === 1) matches.push({ phrase, edits });
  }
  if (matches.length === 0) return undefined;

  const canonicalNames = new Set(matches.map(({ phrase }) => phrase.canonicalName));
  if (canonicalNames.size !== 1) return undefined;
  return matches[0]?.phrase;
}

function matchIngredient(
  words: readonly string[],
  start: number,
  vocabularyIndex: VocabularyIndex,
): IngredientPhrase | undefined {
  return (
    matchExactIngredient(words, start, vocabularyIndex) ??
    matchTypoIngredient(words, start, vocabularyIndex)
  );
}

function setCategory(
  categories: Map<string, "included" | "excluded">,
  ingredient: IngredientPhrase,
  category: "included" | "excluded",
): void {
  categories.set(ingredient.canonicalName, category);
}

export function parseIngredientText(
  text: string,
  vocabulary: ReadonlySet<string> | readonly string[],
  aliases: readonly IngredientAlias[] = [],
): IngredientParseResult {
  const words = tokenize(text);
  const vocabularyIndex = buildVocabularyIndex(vocabulary, aliases);
  const categories = new Map<string, "included" | "excluded">();
  const unrecognized = new Set<string>();

  for (let index = 0; index < words.length;) {
    const word = words[index];
    if (!word) break;

    if (
      word === "do" &&
      words[index + 1] === "not" &&
      words[index + 2] === "have"
    ) {
      const targetStart = words[index + 3] === "any" ? index + 4 : index + 3;
      const ingredient = matchIngredient(words, targetStart, vocabularyIndex);
      if (ingredient) {
        setCategory(categories, ingredient, "excluded");
        index = targetStart + ingredient.words.length;
      } else {
        const unknownWord = words[targetStart];
        if (unknownWord && !FILLER_WORDS.has(unknownWord)) unrecognized.add(unknownWord);
        index = unknownWord ? targetStart + 1 : targetStart;
      }
      continue;
    }

    if (NEGATION_WORDS.has(word)) {
      const ingredient = matchIngredient(words, index + 1, vocabularyIndex);
      if (ingredient) {
        setCategory(categories, ingredient, "excluded");
        index += ingredient.words.length + 1;
      } else {
        index += 1;
      }
      continue;
    }

    const exactIngredient = matchExactIngredient(words, index, vocabularyIndex);
    if (exactIngredient) {
      setCategory(categories, exactIngredient, "included");
      index += exactIngredient.words.length;
      continue;
    }

    if (FILLER_WORDS.has(word)) {
      index += 1;
      continue;
    }

    const typoIngredient = matchTypoIngredient(words, index, vocabularyIndex);
    if (typoIngredient) {
      setCategory(categories, typoIngredient, "included");
      index += typoIngredient.words.length;
      continue;
    }

    unrecognized.add(word);
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
