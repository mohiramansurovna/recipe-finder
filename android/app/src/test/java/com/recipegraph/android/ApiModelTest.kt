package com.recipegraph.android

import com.recipegraph.android.data.AccountInputValidator
import com.recipegraph.android.data.ApiResult
import com.recipegraph.android.data.ParseResult
import com.recipegraph.android.data.RecipeRepository
import com.recipegraph.android.data.searchRequestPayload
import com.recipegraph.android.data.toApiError
import com.recipegraph.android.data.toParseResult
import com.recipegraph.android.data.toRecipeDetail
import com.recipegraph.android.data.toSearchResult
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiModelTest {
    @Test
    fun registrationAndVerificationValidationMatchBackendContracts() {
        assertNull(AccountInputValidator.registrationError("demo@example.test", "recipe_user", "long-enough-password"))
        assertEquals(
            "Username must contain 3–30 letters, numbers, or underscores.",
            AccountInputValidator.registrationError("demo@example.test", "bad-name", "long-enough-password")
        )
        assertEquals(
            "Password must be at least 12 characters.",
            AccountInputValidator.registrationError("demo@example.test", "recipe_user", "short")
        )
        assertNull(AccountInputValidator.verificationError("12345678"))
        assertEquals("Enter the eight-digit verification code.", AccountInputValidator.verificationError("123"))
    }

    @Test
    fun unavailableSignInNeverCreatesASession() {
        val result = RecipeRepository("https://demo.example.test").signInUnavailable()
        assertTrue(result is ApiResult.Failure)
        assertEquals("UNAVAILABLE", (result as ApiResult.Failure).error.code)
    }

    @Test
    fun parsedUnknownTermsRemainEditableAndCanBeCorrected() {
        val parsed = JSONObject(
            """{"included":["chicken"],"excluded":["milk"],"excludedCategories":["dairy"],"unrecognized":["tofurkey"]}"""
        ).toParseResult()

        assertEquals(listOf("tofurkey"), parsed.unrecognized)
        val corrected = parsed.updateTerm("Unrecognized", "tofurkey", "turkey")
        assertEquals(emptyList<String>(), corrected.unrecognized)
        assertEquals(listOf("chicken", "turkey"), corrected.included)
        assertEquals(listOf("milk"), corrected.excluded)
        assertEquals(listOf("dairy"), corrected.excludedCategories)
        assertEquals(emptyList<String>(), parsed.removeTerm("Unrecognized", "tofurkey").unrecognized)
    }

    @Test
    fun searchRequestUsesBackendCriteriaAndNextCursor() {
        val criteria = ParseResult(
            included = listOf("chicken"),
            excluded = listOf("milk"),
            excludedCategories = listOf("dairy"),
            unrecognized = listOf("tofurkey")
        )
        val firstPage = searchRequestPayload(criteria, null)
        val nextPage = searchRequestPayload(criteria, "cursor-2")

        assertEquals(listOf("chicken"), firstPage["included"])
        assertEquals(listOf("milk"), nextPage["excluded"])
        assertEquals(listOf("dairy"), nextPage["excludedCategories"])
        assertEquals("cursor-2", nextPage["cursor"])
        assertFalse(nextPage.containsKey("unrecognized"))
        assertEquals(firstPage.filterKeys { it != "cursor" }, nextPage.filterKeys { it != "cursor" })
    }

    @Test
    fun searchResponseUsesDocumentedNextCursorAndFitFields() {
        val page = JSONObject(
            """
            {
              "recipes": [{
                "id": "recipe-1",
                "name": "Soup",
                "minutes": null,
                "matchedIngredients": ["chicken"],
                "missingIngredients": ["onion"],
                "excludedIngredients": []
              }],
              "totalCount": 1,
              "nextCursor": "cursor-2"
            }
            """.trimIndent()
        ).toSearchResult()

        assertEquals("cursor-2", page.nextCursor)
        assertEquals(listOf("chicken"), page.recipes.single().matchedIngredients)
        assertEquals(listOf("onion"), page.recipes.single().missingIngredients)
        assertNull(page.recipes.single().minutes)
    }

    @Test
    fun detailResponseKeepsOptionalDataAndOnlyAnonymousRatingValues() {
        val detail = JSONObject(
            """
            {
              "id": "recipe-1",
              "name": "Soup",
              "minutes": null,
              "instructions": null,
              "ingredients": ["chicken"],
              "cuisines": [],
              "ratings": {"individual": [4, 5], "aggregate": 4.5}
            }
            """.trimIndent()
        ).toRecipeDetail()

        assertNull(detail.instructions)
        assertEquals(listOf(4, 5), detail.ratings)
        assertEquals(4.5, detail.ratingAggregate!!, 0.001)
    }

    @Test
    fun notFoundAndUnavailableErrorsRemainDistinct() {
        val notFound = """{"error":{"code":"RECIPE_NOT_FOUND","message":"The requested recipe was not found."}}"""
            .toApiError(404)
        val unavailable = """{"error":{"code":"SERVICE_UNAVAILABLE","message":"Recipe data is unavailable."}}"""
            .toApiError(503)

        assertEquals("RECIPE_NOT_FOUND", notFound.code)
        assertEquals("SERVICE_UNAVAILABLE", unavailable.code)
        assertFalse(notFound.code == unavailable.code)
    }
}
