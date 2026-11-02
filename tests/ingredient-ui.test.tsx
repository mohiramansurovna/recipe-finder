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
  it("shows canonical alias and typo matches and searches with excluded criteria", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ ingredients: ["butter", "chicken", "green onion"] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["green onion", "chicken"],
          excluded: ["butter"],
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
        maxMinutes: null,
        cursor: null,
      }),
    );
  });

  it("parses text, shows all categories, and credits the dataset without contributor details", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["butter", "chicken", "spinach"] }))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["chicken"],
          excluded: ["butter"],
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
      .mockResolvedValueOnce(
        jsonResponse({ included: ["chicken"], excluded: [], unrecognized: [] }),
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

  it("communicates when a completed search has no matching recipes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["chicken"] }))
      .mockResolvedValueOnce(
        jsonResponse({ included: ["chicken"], excluded: [], unrecognized: [] }),
      )
      .mockResolvedValueOnce(jsonResponse({ recipes: [], nextCursor: null }));
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
      .mockResolvedValueOnce(
        jsonResponse({ included: ["chicken"], excluded: [], unrecognized: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ recipes: [chickenRecipe], nextCursor: "cursor-page-two" }),
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
    const searchCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/recipes/search",
    );
    expect(JSON.parse(String(searchCalls[1]?.[1]?.body))).toEqual({
      included: ["chicken"],
      excluded: [],
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
      .mockResolvedValueOnce(
        jsonResponse({ included: ["chicken"], excluded: [], unrecognized: [] }),
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
      if (url === "/api/ingredients/parse") {
        return jsonResponse({
          included: ["chicken"],
          excluded: [],
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
        nextCursor: null,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Stale result" })).not.toBeInTheDocument(),
    );
  });

  it("supports adding, removing, and toggling criteria with keyboard controls", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ingredients: ["chicken", "spinach"] }))
      .mockResolvedValueOnce(
        jsonResponse({
          included: ["chicken"],
          excluded: [],
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
