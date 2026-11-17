package com.recipegraph.android

import com.recipegraph.android.data.AccountInputValidator
import com.recipegraph.android.data.ApiResult
import com.recipegraph.android.data.ApiTransport
import com.recipegraph.android.data.HttpResponse
import com.recipegraph.android.data.InMemoryTokenStore
import com.recipegraph.android.data.SessionTokens
import com.recipegraph.android.data.optionalInt
import com.recipegraph.android.data.requiresSignIn
import com.recipegraph.android.data.toFavorites
import kotlinx.coroutines.runBlocking
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

    private class ScriptedTransport(private val replies: MutableList<HttpResponse>) : ApiTransport {
        val calls = mutableListOf<Triple<String, String, String?>>()
        override suspend fun execute(
            method: String,
            path: String,
            body: Map<String, Any?>?,
            bearerToken: String?
        ): HttpResponse {
            calls += Triple(method, path, bearerToken)
            return replies.removeAt(0)
        }
    }

    private fun error(status: Int, code: String) =
        HttpResponse(status, """{"error":{"code":"$code","message":"$code message"}}""")

    private val tokens = SessionTokens("s1", "access-1", "refresh-1")
    private val tokenJson = """{"sessionId":"s2","accessToken":"access-2","refreshToken":"refresh-2"}"""

    @Test
    fun signInStoresTokensOnlyOnSuccess() = runBlocking {
        val store = InMemoryTokenStore()
        val failing = RecipeRepository(ScriptedTransport(mutableListOf(error(401, "INVALID_CREDENTIALS"))), store)
        assertTrue(failing.signIn("a@example.test", "pw", "Pixel") is ApiResult.Failure)
        assertNull(store.load())

        val ok = RecipeRepository(ScriptedTransport(mutableListOf(HttpResponse(200, tokenJson))), store)
        assertTrue(ok.signIn("a@example.test", "pw", "Pixel") is ApiResult.Success)
        assertEquals("access-2", store.load()!!.accessToken)
    }

    @Test
    fun expiredAccessTokenRefreshesOnceReplacesBothTokensAndRetries() = runBlocking {
        val store = InMemoryTokenStore(tokens)
        val transport = ScriptedTransport(
            mutableListOf(
                error(401, "SESSION_EXPIRED"),
                HttpResponse(200, tokenJson),
                HttpResponse(200, """{"email":"a@example.test","username":"user_a"}""")
            )
        )
        val result = RecipeRepository(transport, store).getProfile()

        assertEquals("user_a", (result as ApiResult.Success).value.username)
        assertEquals("refresh-2", store.load()!!.refreshToken)
        assertEquals("access-2", store.load()!!.accessToken)
        assertEquals("access-1", transport.calls[0].third)
        assertEquals("/api/accounts/sessions/refresh", transport.calls[1].second)
        assertEquals("access-2", transport.calls[2].third)
    }

    @Test
    fun rejectedRefreshClearsSessionAndRequiresSignIn() = runBlocking {
        val store = InMemoryTokenStore(tokens)
        val transport = ScriptedTransport(mutableListOf(error(401, "SESSION_EXPIRED"), error(401, "SESSION_EXPIRED")))
        val result = RecipeRepository(transport, store).listFavorites()

        assertTrue((result as ApiResult.Failure).error.requiresSignIn())
        assertNull(store.load())
        assertEquals(2, transport.calls.size)
    }

    @Test
    fun offlineRefreshKeepsSessionSoItCanBeRetriedLater() = runBlocking {
        val store = InMemoryTokenStore(tokens)
        val transport = ScriptedTransport(mutableListOf(error(401, "SESSION_EXPIRED")))
        val repo = RecipeRepository(object : ApiTransport {
            override suspend fun execute(method: String, path: String, body: Map<String, Any?>?, bearerToken: String?): HttpResponse {
                if (path.endsWith("/refresh")) throw java.io.IOException("offline")
                return transport.execute(method, path, body, bearerToken)
            }
        }, store)
        val result = repo.getProfile()

        assertEquals("SERVICE_UNAVAILABLE", (result as ApiResult.Failure).error.code)
        assertEquals("refresh-1", store.load()!!.refreshToken)
    }

    @Test
    fun protectedCallsWithoutASessionNeverReachTheNetwork() = runBlocking {
        val transport = ScriptedTransport(mutableListOf())
        val result = RecipeRepository(transport, InMemoryTokenStore()).listFavorites()
        assertTrue((result as ApiResult.Failure).error.requiresSignIn())
        assertTrue(transport.calls.isEmpty())
    }

    @Test
    fun signOutClearsLocalSessionEvenWhenServerIsUnreachable() = runBlocking {
        val store = InMemoryTokenStore(tokens)
        val repo = RecipeRepository(object : ApiTransport {
            override suspend fun execute(method: String, path: String, body: Map<String, Any?>?, bearerToken: String?): HttpResponse =
                throw java.io.IOException("offline")
        }, store)
        repo.signOut()
        assertNull(store.load())
    }

    @Test
    fun deleteAccountSendsConfirmBodyAndClearsSessionOnlyOnSuccess() = runBlocking {
        val store = InMemoryTokenStore(tokens)
        var sentBody: Map<String, Any?>? = null
        val failing = RecipeRepository(object : ApiTransport {
            override suspend fun execute(method: String, path: String, body: Map<String, Any?>?, bearerToken: String?): HttpResponse {
                sentBody = body
                return error(500, "SERVICE_UNAVAILABLE")
            }
        }, store)
        assertTrue(failing.deleteAccount() is ApiResult.Failure)
        assertEquals(mapOf<String, Any?>("confirm" to true), sentBody)
        assertEquals("access-1", store.load()!!.accessToken)

        val ok = RecipeRepository(ScriptedTransport(mutableListOf(HttpResponse(200, "{}"))), store)
        assertTrue(ok.deleteAccount() is ApiResult.Success)
        assertNull(store.load())
    }

    @Test
    fun favoritesAndOwnRatingResponsesParse() {
        val favorites = JSONObject(
            """{"favorites":[{"id":"r1","name":"Soup","minutes":null,"ingredientNames":["chicken"]}]}"""
        ).toFavorites()
        assertEquals("Soup", favorites.single().name)
        assertNull(favorites.single().minutes)
        assertEquals(listOf("chicken"), favorites.single().ingredientNames)
        assertEquals(4, JSONObject("""{"rating":4}""").optionalInt("rating"))
        assertNull(JSONObject("""{"rating":null}""").optionalInt("rating"))
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
        val firstPage = searchRequestPayload(criteria, 4, null)
        val nextPage = searchRequestPayload(criteria, 4, "cursor-2")

        assertEquals(listOf("chicken"), firstPage["included"])
        assertEquals(listOf("milk"), nextPage["excluded"])
        assertEquals(listOf("dairy"), nextPage["excludedCategories"])
        assertEquals(4, firstPage["minRating"])
        assertEquals(null, searchRequestPayload(criteria, null, null)["minRating"])
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
