// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import App from "../web/src/app/App.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

const filterOptions = {
  categories: ["dairy", "fish/seafood", "meat", "nuts"],
  cuisines: ["Italian", "Mexican"],
};

class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element) {
    const bounds = target.getBoundingClientRect();
    this.callback(
      [
        {
          boundingClientRect: bounds,
          intersectionRatio: 1,
          intersectionRect: bounds,
          isIntersecting: true,
          rootBounds: null,
          target,
          time: performance.now(),
        },
      ],
      this,
    );
  }

  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
}

describe("ingredient criteria interface", () => {
  it("opens a recipe detail view with instructions and anonymous individual ratings", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["salt", "water"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["salt"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            {
              id: "recipe-1",
              name: "Soup",
              minutes: 25,
              matchedIngredients: ["salt"],
              missingIngredients: [],
              excludedIngredients: [],
            },
          ],
          totalCount: 1,
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "recipe-1",
          name: "Soup",
          minutes: 25,
          instructions: ["Simmer.", "Serve."],
          ingredients: ["salt", "water"],
          cuisines: ["Italian"],
          ratings: { individual: [5, 3], aggregate: null },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "salt");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    await user.click(await screen.findByRole("button", { name: "View details for Soup" }));

    const details = await screen.findByRole("region", { name: "Soup" });
    expect(details).toHaveTextContent("25 minutes");
    expect(details).toHaveTextContent("salt, water");
    expect(details).toHaveTextContent("Italian");
    expect(details).toHaveTextContent("Simmer.");
    expect(details).toHaveTextContent("Serve.");
    expect(details).toHaveTextContent("5 out of 5");
    expect(details).toHaveTextContent("3 out of 5");
    expect(details).not.toHaveTextContent(/contributor|rater|user id/i);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/recipes/recipe-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("omits missing detail fields and uses the available aggregate rating", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["lettuce"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: [],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            {
              id: "recipe-2",
              name: "Salad",
              minutes: null,
              matchedIngredients: [],
              missingIngredients: [],
              excludedIngredients: [],
            },
          ],
          totalCount: 1,
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "recipe-2",
          name: "Salad",
          minutes: null,
          instructions: null,
          ingredients: ["lettuce"],
          cuisines: [],
          ratings: { individual: [], aggregate: 4.25 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "lettuce");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    await user.click(await screen.findByRole("button", { name: "View details for Salad" }));

    const details = await screen.findByRole("region", { name: "Salad" });
    expect(details).toHaveTextContent("lettuce");
    expect(details).toHaveTextContent("Average rating: 4.25 out of 5");
    expect(details).not.toHaveTextContent("minutes");
    expect(details).not.toHaveTextContent("Instructions");
    expect(details).not.toHaveTextContent("Cuisine");
    expect(details).not.toHaveTextContent("No ratings yet.");
  });

  it("shows an explicit empty rating state and never treats an unknown recipe as details", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["rice"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["rice"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            {
              id: "missing-detail",
              name: "Search result",
              minutes: 10,
              matchedIngredients: ["rice"],
              missingIngredients: [],
              excludedIngredients: [],
            },
          ],
          totalCount: 1,
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "RECIPE_NOT_FOUND", message: "The requested recipe was not found." } },
          404,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "rice");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    await user.click(await screen.findByRole("button", { name: "View details for Search result" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The requested recipe was not found.",
    );
    expect(screen.getByRole("heading", { name: "Recipe details" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Search result", level: 2 })).toBeVisible();
    expect(screen.queryByText("No ratings yet.")).not.toBeInTheDocument();
  });

  it("shows the no-ratings state when the detail response has no rating sources", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["rice"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["rice"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            {
              id: "recipe-3",
              name: "Rice",
              minutes: 5,
              matchedIngredients: ["rice"],
              missingIngredients: [],
              excludedIngredients: [],
            },
          ],
          totalCount: 1,
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "recipe-3",
          name: "Rice",
          minutes: 5,
          instructions: null,
          ingredients: ["rice"],
          cuisines: [],
          ratings: { individual: [], aggregate: null },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "rice");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    await user.click(await screen.findByRole("button", { name: "View details for Rice" }));

    const details = await screen.findByRole("region", { name: "Rice" });
    expect(details).toHaveTextContent("No ratings yet.");
  });

  it("shows canonical alias and typo matches and searches with excluded criteria", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ ingredients: ["butter", "chicken", "green onion"] }),
      )
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["green onion", "chicken"],
          excluded: ["butter"],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            {
              id: "canonical-match",
              name: "Scallion chicken",
              minutes: 20,
              matchedIngredients: ["green onion", "chicken"],
              missingIngredients: [],
              excludedIngredients: ["butter"],
            },
          ],
          totalCount: 1,
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    const input = screen.getByRole("textbox", { name: "Ingredients you have" });
    await user.type(input, "scallion, chiken, I don't have butter");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));

    const included = await screen.findByRole("region", { name: "Included" });
    expect(included).toHaveTextContent("green onion");
    expect(included).toHaveTextContent("chicken");
    expect(included).not.toHaveTextContent("scallion");
    expect(screen.getByRole("region", { name: "Excluded" })).toHaveTextContent("butter");
    expect(await screen.findByRole("heading", { name: "Scallion chicken" })).toBeVisible();
    expect(
      fetchMock.mock.calls.find(([url]) => url === "/api/recipes/search")?.[1]?.body,
    ).toBe(
      JSON.stringify({
        included: ["green onion", "chicken"],
        excluded: ["butter"],
        excludedCategories: [],
        cuisines: [],
        maxMinutes: null,
        cursor: null,
      }),
    );
  });

  it("parses text, shows all categories, and credits the dataset without contributor details", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["butter", "chicken", "spinach"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["chicken"],
          excluded: ["butter"],
          excludedCategories: [],
          unrecognized: ["dragonfruit"],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            {
              id: "1",
              name: "Chicken and rice",
              minutes: 25,
              matchedIngredients: ["chicken"],
              missingIngredients: ["rice"],
              excludedIngredients: ["butter"],
            },
          ],
          totalCount: 42,
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Maximum cooking time" }),
      "30",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Ingredients you have" }),
      "chicken, no butter, dragonfruit",
    );
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));

    expect(await screen.findByRole("region", { name: "Included" })).toHaveTextContent(
      "chicken",
    );
    expect(screen.getByRole("region", { name: "Excluded" })).toHaveTextContent("butter");
    expect(screen.getByRole("region", { name: "Not recognized" })).toHaveTextContent(
      "dragonfruit",
    );
    expect(await screen.findByRole("heading", { name: "Chicken and rice" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "42 recipes found" })).toBeVisible();
    expect(screen.getByText("25 minutes")).toBeVisible();
    expect(screen.getByText("Matched ingredients").parentElement).toHaveTextContent(
      "chicken",
    );
    expect(screen.getByText("Missing ingredients").parentElement).toHaveTextContent(
      "rice",
    );
    expect(
      screen.getByText("Contains excluded ingredients").parentElement,
    ).toHaveTextContent("butter");
    expect(
      screen.getByRole("link", { name: "Food.com Recipes and Interactions dataset" }),
    ).toBeVisible();
    expect(screen.queryByText(/contributor/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/recipes/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          included: ["chicken"],
          excluded: ["butter"],
          excludedCategories: [],
          cuisines: [],
          maxMinutes: 30,
          cursor: null,
        }),
      }),
    );
  });

  it("shows unknown cooking time and a retryable search failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["chicken"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["chicken"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Search is unavailable." } }, 503),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            {
              id: "2",
              name: "Chicken salad",
              minutes: null,
              matchedIngredients: ["chicken"],
              missingIngredients: [],
              excludedIngredients: [],
            },
          ],
          totalCount: 1,
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "chicken");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Search is unavailable.");
    await user.click(screen.getByRole("button", { name: "Retry recipe search" }));
    expect(await screen.findByRole("heading", { name: "Chicken salad" })).toBeVisible();
    expect(screen.getByText("Cooking time unknown")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Maximum cooking time" })).toHaveValue("");
  });

  it("switches themes by keyboard and keeps error states inside the selected theme", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["chicken"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["chicken"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Search is unavailable." } }, 503),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    const app = screen.getByRole("main").parentElement;
    const themeToggle = screen.getByRole("button", { name: "Switch to dark theme" });
    expect(app).toHaveAttribute("data-theme", "light");

    themeToggle.focus();
    await user.keyboard("{Enter}");
    expect(app).toHaveAttribute("data-theme", "dark");
    expect(themeToggle).toHaveAccessibleName("Switch to light theme");
    expect(themeToggle).toHaveAttribute("aria-pressed", "true");

    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "chicken");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    const searchError = await screen.findByRole("alert");
    expect(searchError).toHaveClass("error-message");
    expect(app).toHaveAttribute("data-theme", "dark");

    themeToggle.focus();
    await user.keyboard("{Enter}");
    expect(app).toHaveAttribute("data-theme", "light");
    expect(searchError).toBeVisible();
  });

  it("communicates when a completed search has no matching recipes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["chicken"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["chicken"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ recipes: [], totalCount: 0, nextCursor: null }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "chicken");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));

    expect(await screen.findByText("No recipes match these criteria.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByRole("heading", { name: "0 recipes found" })).toBeVisible();
  });

  it("loads the next cursor page and avoids duplicate recipe cards", async () => {
    const chickenRecipe = {
      id: "1",
      name: "Chicken soup",
      minutes: 15,
      matchedIngredients: ["chicken"],
      missingIngredients: [],
      excludedIngredients: [],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["chicken"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["chicken"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [chickenRecipe],
          totalCount: 2,
          nextCursor: "cursor-page-two",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            chickenRecipe,
            {
              id: "2",
              name: "Chicken salad",
              minutes: null,
              matchedIngredients: ["chicken"],
              missingIngredients: [],
              excludedIngredients: [],
            },
          ],
          totalCount: 2,
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "chicken");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    expect(await screen.findByRole("heading", { name: "Chicken soup" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Load more recipes" }));
    expect(await screen.findByRole("heading", { name: "Chicken salad" })).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Chicken soup" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "2 recipes found" })).toBeVisible();
    const searchCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/recipes/search",
    );
    expect(JSON.parse(String(searchCalls[1]?.[1]?.body))).toEqual({
      included: ["chicken"],
      excluded: [],
      excludedCategories: [],
      cuisines: [],
      maxMinutes: null,
      cursor: "cursor-page-two",
    });
    expect(screen.queryByRole("button", { name: "Load more recipes" })).not.toBeInTheDocument();
  });

  it("automatically requests another page when the scroll sentinel intersects", async () => {
    vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["chicken"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["chicken"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            {
              id: "1",
              name: "First recipe",
              minutes: 10,
              matchedIngredients: ["chicken"],
              missingIngredients: [],
              excludedIngredients: [],
            },
          ],
          totalCount: 2,
          nextCursor: "auto-next",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          recipes: [
            {
              id: "2",
              name: "Automatically loaded recipe",
              minutes: 12,
              matchedIngredients: ["chicken"],
              missingIngredients: [],
              excludedIngredients: [],
            },
          ],
          totalCount: 2,
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "chicken");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));

    expect(
      await screen.findByRole("heading", { name: "Automatically loaded recipe" }),
    ).toBeVisible();
    const searchCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/recipes/search",
    );
    expect(JSON.parse(String(searchCalls[1]?.[1]?.body))).toMatchObject({
      cursor: "auto-next",
    });
  });

  it("restarts searches for chip and time edits and ignores stale responses", async () => {
    let resolveSlowSearch: ((response: Response) => void) | undefined;
    const slowSearch = new Promise<Response>((resolve) => {
      resolveSlowSearch = resolve;
    });
    let searchCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === "/api/ingredients") {
        return jsonResponse({ ingredients: ["chicken"] });
      }
      if (url === "/api/filters") return jsonResponse(filterOptions);
      if (url === "/api/ingredients/parse") {
        return jsonResponse({
          included: ["chicken"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        });
      }
      searchCount += 1;
      if (searchCount === 1) return slowSearch;
      return jsonResponse({
        recipes: [
          {
            id: `current-${searchCount}`,
            name: `Updated result ${searchCount}`,
            minutes: 10,
            matchedIngredients: [],
            missingIngredients: [],
            excludedIngredients: [],
          },
        ],
        totalCount: 1,
        nextCursor: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "chicken");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    await waitFor(() => expect(searchCount).toBe(1));

    await user.click(
      await screen.findByRole("button", { name: "Move chicken to excluded" }),
    );
    expect(await screen.findByRole("heading", { name: "Updated result 2" })).toBeVisible();
    const searchCalls = () =>
      fetchMock.mock.calls.filter(([url]) => url === "/api/recipes/search");
    expect(JSON.parse(String(searchCalls()[1]?.[1]?.body))).toEqual({
      included: [],
      excluded: ["chicken"],
      excludedCategories: [],
      cuisines: [],
      maxMinutes: null,
      cursor: null,
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Maximum cooking time" }),
      "15",
    );
    expect(await screen.findByRole("heading", { name: "Updated result 3" })).toBeVisible();
    expect(JSON.parse(String(searchCalls()[2]?.[1]?.body))).toEqual({
      included: [],
      excluded: ["chicken"],
      excludedCategories: [],
      cuisines: [],
      maxMinutes: 15,
      cursor: null,
    });

    resolveSlowSearch?.(
      jsonResponse({
        recipes: [
          {
            id: "stale",
            name: "Stale result",
            minutes: 5,
            matchedIngredients: ["chicken"],
            missingIngredients: [],
            excludedIngredients: [],
          },
        ],
        totalCount: 1,
        nextCursor: null,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Stale result" })).not.toBeInTheDocument(),
    );
  });

  it("uses accessible category chips and the Vegetarian preset to restart searches", async () => {
    const searchBodies: unknown[] = [];
    let searchCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === "/api/ingredients") {
        return jsonResponse({ ingredients: ["chicken"] });
      }
      if (url === "/api/filters") return jsonResponse(filterOptions);
      if (url === "/api/ingredients/parse") {
        return jsonResponse({
          included: ["chicken"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        });
      }
      searchBodies.push(JSON.parse(String(init?.body)));
      searchCount += 1;
      return jsonResponse({
        recipes: [
          {
            id: `category-result-${searchCount}`,
            name: `Category result ${searchCount}`,
            minutes: 10,
            matchedIngredients: ["chicken"],
            missingIngredients: [],
            excludedIngredients: [],
          },
        ],
        totalCount: 1,
        nextCursor: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "chicken");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    expect(await screen.findByRole("heading", { name: "Category result 1" })).toBeVisible();

    const vegetarian = screen.getByRole("button", { name: "Vegetarian" });
    vegetarian.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Category result 2" })).toBeVisible();
    expect(vegetarian).toHaveAttribute("aria-pressed", "true");
    expect(searchBodies[1]).toMatchObject({
      excludedCategories: ["meat", "fish/seafood"],
      cursor: null,
    });

    const meatChip = screen.getByRole("button", { name: "meat" });
    meatChip.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Category result 3" })).toBeVisible();
    expect(vegetarian).toHaveAttribute("aria-pressed", "false");
    expect(searchBodies[2]).toMatchObject({
      excludedCategories: ["fish/seafood"],
      cursor: null,
    });
  });

  it("supports multi-cuisine selection, clearing, and criteria-bound pagination", async () => {
    const searchBodies: unknown[] = [];
    let searchCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === "/api/ingredients") {
        return jsonResponse({ ingredients: ["chicken"] });
      }
      if (url === "/api/filters") return jsonResponse(filterOptions);
      if (url === "/api/ingredients/parse") {
        return jsonResponse({
          included: ["chicken"],
          excluded: [],
          excludedCategories: [],
          unrecognized: [],
        });
      }

      searchBodies.push(JSON.parse(String(init?.body)));
      searchCount += 1;
      return jsonResponse({
        recipes: [
          {
            id: `cuisine-result-${searchCount}`,
            name: `Cuisine result ${searchCount}`,
            minutes: 10,
            matchedIngredients: ["chicken"],
            missingIngredients: [],
            excludedIngredients: [],
          },
        ],
        totalCount: 3,
        nextCursor: `cursor-${searchCount}`,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "chicken");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    expect(await screen.findByRole("heading", { name: "Cuisine result 1" })).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "Italian" }));
    expect(await screen.findByRole("heading", { name: "Cuisine result 2" })).toBeVisible();
    expect(searchBodies[1]).toMatchObject({ cuisines: ["Italian"], cursor: null });

    await user.click(screen.getByRole("checkbox", { name: "Mexican" }));
    expect(await screen.findByRole("heading", { name: "Cuisine result 3" })).toBeVisible();
    expect(searchBodies[2]).toMatchObject({
      cuisines: ["Italian", "Mexican"],
      cursor: null,
    });

    await user.click(screen.getByRole("button", { name: "Load more recipes" }));
    expect(await screen.findByRole("heading", { name: "Cuisine result 4" })).toBeVisible();
    expect(searchBodies[3]).toMatchObject({
      cuisines: ["Italian", "Mexican"],
      cursor: "cursor-3",
    });

    await user.click(screen.getByRole("button", { name: "Clear cuisine filters" }));
    expect(await screen.findByRole("heading", { name: "Cuisine result 5" })).toBeVisible();
    expect(searchBodies[4]).toMatchObject({ cuisines: [], cursor: null });
  });

  it("supports adding, removing, and toggling criteria with keyboard controls", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["chicken", "spinach"] }))
      .mockResolvedValueOnce(jsonResponse(filterOptions))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["chicken"],
          excluded: [],
          excludedCategories: [],
          unrecognized: ["mystery"],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
    await user.type(screen.getByRole("textbox", { name: "Ingredients you have" }), "chicken");
    await user.click(screen.getByRole("button", { name: "Interpret ingredients" }));
    const toggleButton = await screen.findByRole("button", {
      name: "Move chicken to excluded",
    });
    toggleButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("region", { name: "Excluded" })).toHaveTextContent("chicken");

    const removeButton = screen.getByRole("button", { name: "Remove mystery" });
    removeButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("region", { name: "Not recognized" })).toHaveTextContent(
      "None",
    );

    const ingredientSearch = screen.getByRole("combobox", {
      name: "Search recognized ingredients",
    });
    await user.type(ingredientSearch, "pin");
    expect(screen.getByRole("listbox", { name: "Matching ingredients" })).toBeVisible();
    expect(screen.getByRole("option", { name: "spinach" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "chicken" })).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Included" })).toHaveTextContent(
        "spinach",
      );
    });
    expect(ingredientSearch).toHaveValue("");
  });
});
