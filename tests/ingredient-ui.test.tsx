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

describe("ingredient criteria interface", () => {
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
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Search recognized ingredients" });
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
    expect(
      screen.getByRole("link", { name: "Food.com Recipes and Interactions dataset" }),
    ).toBeVisible();
    expect(screen.queryByText(/contributor/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/ingredients/parse",
      expect.objectContaining({ method: "POST" }),
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
