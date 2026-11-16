package com.recipegraph.android.data

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

sealed class ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>()
    data class Failure(val error: ApiError) : ApiResult<Nothing>()
}

data class ApiError(
    val code: String,
    val message: String
)

data class ParseResult(
    val included: List<String>,
    val excluded: List<String>,
    val excludedCategories: List<String>,
    val unrecognized: List<String>
) {
    fun updateTerm(section: String, oldTerm: String, newTerm: String): ParseResult {
        val replacement = newTerm.trim()
        return when (section) {
            "Included" -> copy(included = included.replace(oldTerm, replacement))
            "Excluded" -> copy(excluded = excluded.replace(oldTerm, replacement))
            "Excluded categories" -> copy(excludedCategories = excludedCategories.replace(oldTerm, replacement))
            else -> copy(
                included = if (replacement.isEmpty()) included else (included + replacement).distinct(),
                unrecognized = unrecognized - oldTerm
            )
        }
    }

    fun removeTerm(section: String, term: String): ParseResult = when (section) {
        "Included" -> copy(included = included - term)
        "Excluded" -> copy(excluded = excluded - term)
        "Excluded categories" -> copy(excludedCategories = excludedCategories - term)
        else -> copy(unrecognized = unrecognized - term)
    }

    private fun List<String>.replace(oldTerm: String, newTerm: String): List<String> =
        mapNotNull { item ->
            when {
                item != oldTerm -> item
                newTerm.isEmpty() -> null
                else -> newTerm
            }
        }.distinct()
}

data class RecipeSummary(
    val id: String,
    val name: String,
    val minutes: Int?,
    val matchedIngredients: List<String>,
    val missingIngredients: List<String>,
    val excludedIngredients: List<String>
)

data class SearchResult(
    val recipes: List<RecipeSummary>,
    val totalCount: Int,
    val nextCursor: String?
)

data class RecipeDetail(
    val id: String,
    val name: String,
    val minutes: Int?,
    val ingredients: List<String>,
    val instructions: List<String>?,
    val cuisines: List<String>,
    val ratings: List<Int>,
    val ratingAggregate: Double?
)

data class AccountProfile(val email: String, val username: String)

data class FavoriteRecipe(
    val id: String,
    val name: String,
    val minutes: Int?,
    val ingredientNames: List<String>
)

interface RecipeDataSource {
    suspend fun register(email: String, username: String, password: String): ApiResult<Unit>
    suspend fun verify(email: String, code: String): ApiResult<Unit>
    suspend fun resendVerification(email: String): ApiResult<Unit>
    suspend fun parseIngredients(text: String): ApiResult<ParseResult>
    suspend fun searchRecipes(criteria: ParseResult, cursor: String?): ApiResult<SearchResult>
    suspend fun getRecipe(recipeId: String): ApiResult<RecipeDetail>

    /** True when a device session is stored; it is verified by the next authenticated call. */
    fun hasStoredSession(): Boolean
    suspend fun signIn(email: String, password: String, deviceName: String): ApiResult<Unit>

    /** Ends this device's session on the server and always clears the local session. */
    suspend fun signOut(): ApiResult<Unit>
    suspend fun getProfile(): ApiResult<AccountProfile>
    suspend fun deleteAccount(): ApiResult<Unit>
    suspend fun listFavorites(): ApiResult<List<FavoriteRecipe>>
    suspend fun addFavorite(recipeId: String): ApiResult<Unit>
    suspend fun removeFavorite(recipeId: String): ApiResult<Unit>
    suspend fun getMyRating(recipeId: String): ApiResult<Int?>
    suspend fun setRating(recipeId: String, rating: Int): ApiResult<Unit>
    suspend fun removeRating(recipeId: String): ApiResult<Unit>
}

const val SESSION_EXPIRED = "SESSION_EXPIRED"
const val UNAUTHENTICATED = "UNAUTHENTICATED"

fun ApiError.requiresSignIn(): Boolean = code == SESSION_EXPIRED || code == UNAUTHENTICATED

class RecipeRepository(
    private val transport: ApiTransport,
    private val tokenStore: TokenStore
) : RecipeDataSource {
    private val refreshLock = Mutex()

    override suspend fun register(email: String, username: String, password: String): ApiResult<Unit> =
        call(
            "POST", "/api/accounts/register",
            mapOf("email" to email.trim(), "username" to username.trim(), "password" to password)
        ) { Unit }

    override suspend fun verify(email: String, code: String): ApiResult<Unit> =
        call("POST", "/api/accounts/verify", mapOf("email" to email.trim(), "code" to code)) { Unit }

    override suspend fun resendVerification(email: String): ApiResult<Unit> =
        call("POST", "/api/accounts/resend-verification", mapOf("email" to email.trim())) { Unit }

    override suspend fun parseIngredients(text: String): ApiResult<ParseResult> =
        call("POST", "/api/ingredients/parse", mapOf("text" to text), mapper = JSONObject::toParseResult)

    override suspend fun searchRecipes(criteria: ParseResult, cursor: String?): ApiResult<SearchResult> =
        call("POST", "/api/recipes/search", searchRequestPayload(criteria, cursor), mapper = JSONObject::toSearchResult)

    override suspend fun getRecipe(recipeId: String): ApiResult<RecipeDetail> =
        call("GET", "/api/recipes/${recipeId.encodePathSegment()}", null) { it.toRecipeDetail() }

    override fun hasStoredSession(): Boolean = tokenStore.load() != null

    override suspend fun signIn(email: String, password: String, deviceName: String): ApiResult<Unit> =
        when (
            val result = call(
                "POST", "/api/accounts/sign-in",
                mapOf("email" to email.trim(), "password" to password, "deviceName" to deviceName.take(120)),
                mapper = JSONObject::toSessionTokens
            )
        ) {
            is ApiResult.Success -> {
                tokenStore.save(result.value)
                ApiResult.Success(Unit)
            }
            is ApiResult.Failure -> result
        }

    override suspend fun signOut(): ApiResult<Unit> {
        val result = authed("POST", "/api/accounts/sign-out", null) { Unit }
        tokenStore.clear()
        return result
    }

    override suspend fun getProfile(): ApiResult<AccountProfile> =
        authed("GET", "/api/accounts/me", null) {
            AccountProfile(email = it.getString("email"), username = it.getString("username"))
        }

    override suspend fun deleteAccount(): ApiResult<Unit> {
        val result = authed("DELETE", "/api/accounts/me", mapOf("confirm" to true)) { Unit }
        if (result is ApiResult.Success) tokenStore.clear()
        return result
    }

    override suspend fun listFavorites(): ApiResult<List<FavoriteRecipe>> =
        authed("GET", "/api/accounts/favorites", null) { it.toFavorites() }

    override suspend fun addFavorite(recipeId: String): ApiResult<Unit> =
        authed("POST", "/api/accounts/favorites", mapOf("recipeId" to recipeId)) { Unit }

    override suspend fun removeFavorite(recipeId: String): ApiResult<Unit> =
        authed("DELETE", "/api/accounts/favorites/${recipeId.encodePathSegment()}", null) { Unit }

    override suspend fun getMyRating(recipeId: String): ApiResult<Int?> =
        authed("GET", "/api/accounts/ratings/${recipeId.encodePathSegment()}", null) { it.optionalInt("rating") }

    override suspend fun setRating(recipeId: String, rating: Int): ApiResult<Unit> =
        authed("POST", "/api/accounts/ratings", mapOf("recipeId" to recipeId, "rating" to rating)) { Unit }

    override suspend fun removeRating(recipeId: String): ApiResult<Unit> =
        authed("DELETE", "/api/accounts/ratings/${recipeId.encodePathSegment()}", null) { Unit }

    /**
     * Sends an authenticated request. On `SESSION_EXPIRED` it refreshes the session once and
     * retries; if the refresh is rejected the local session is cleared and the caller must
     * return the person to sign-in.
     */
    private suspend fun <T> authed(
        method: String,
        path: String,
        body: Map<String, Any?>?,
        mapper: (JSONObject) -> T
    ): ApiResult<T> {
        val tokens = tokenStore.load()
            ?: return ApiResult.Failure(ApiError(UNAUTHENTICATED, "Sign in to continue."))
        val first = call(method, path, body, tokens.accessToken, mapper)
        if (first !is ApiResult.Failure || first.error.code != SESSION_EXPIRED) return first

        when (val refreshed = refreshSession(tokens)) {
            is ApiResult.Failure -> return refreshed
            is ApiResult.Success -> Unit
        }
        val renewed = tokenStore.load()
            ?: return ApiResult.Failure(ApiError(SESSION_EXPIRED, SESSION_EXPIRED_MESSAGE))
        return call(method, path, body, renewed.accessToken, mapper)
    }

    private suspend fun refreshSession(stale: SessionTokens): ApiResult<Unit> = refreshLock.withLock {
        val current = tokenStore.load()
            ?: return@withLock ApiResult.Failure(ApiError(SESSION_EXPIRED, SESSION_EXPIRED_MESSAGE))
        // Another request already rotated the pair while this one waited for the lock.
        if (current.refreshToken != stale.refreshToken) return@withLock ApiResult.Success(Unit)

        when (
            val result = call(
                "POST", "/api/accounts/sessions/refresh",
                mapOf("refreshToken" to current.refreshToken),
                mapper = JSONObject::toSessionTokens
            )
        ) {
            is ApiResult.Success -> {
                // Refresh tokens are single-use, so the new pair must replace the old one.
                tokenStore.save(result.value)
                ApiResult.Success(Unit)
            }
            is ApiResult.Failure -> if (result.error.code == SESSION_EXPIRED || result.error.code == "INVALID_REQUEST") {
                tokenStore.clear()
                ApiResult.Failure(ApiError(SESSION_EXPIRED, SESSION_EXPIRED_MESSAGE))
            } else {
                // Offline or rate limited: keep the session so a later attempt can still refresh.
                result
            }
        }
    }

    private suspend fun <T> call(
        method: String,
        path: String,
        body: Map<String, Any?>?,
        bearerToken: String? = null,
        mapper: (JSONObject) -> T
    ): ApiResult<T> = try {
        val response = transport.execute(method, path, body, bearerToken)
        if (response.status in 200..299) {
            ApiResult.Success(mapper(JSONObject(response.body)))
        } else {
            ApiResult.Failure(response.body.toApiError(response.status))
        }
    } catch (exception: CancellationException) {
        throw exception
    } catch (exception: Exception) {
        Log.w("RecipeRepository", "API request failed: $method $path (${exception.javaClass.simpleName}: ${exception.message})")
        ApiResult.Failure(
            ApiError("SERVICE_UNAVAILABLE", "The backend is unavailable. Check the API base URL and try again.")
        )
    }

    private companion object {
        const val SESSION_EXPIRED_MESSAGE = "Your session expired. Sign in again."
    }
}

internal fun JSONObject.stringList(key: String): List<String> {
    val array = optJSONArray(key) ?: JSONArray()
    return List(array.length()) { index -> array.getString(index) }
}

internal fun JSONObject.toParseResult() = ParseResult(
    included = stringList("included"),
    excluded = stringList("excluded"),
    excludedCategories = stringList("excludedCategories"),
    unrecognized = stringList("unrecognized")
)

internal fun JSONObject.toSearchResult(): SearchResult {
    val recipes = optJSONArray("recipes")?.let { values ->
        List(values.length()) { index ->
            val item = values.getJSONObject(index)
            RecipeSummary(
                id = item.getString("id"),
                name = item.getString("name"),
                minutes = item.optionalInt("minutes"),
                matchedIngredients = item.stringList("matchedIngredients"),
                missingIngredients = item.stringList("missingIngredients"),
                excludedIngredients = item.stringList("excludedIngredients")
            )
        }
    }.orEmpty()
    return SearchResult(
        recipes = recipes,
        totalCount = optInt("totalCount"),
        nextCursor = optionalString("nextCursor")
    )
}

internal fun JSONObject.toRecipeDetail(): RecipeDetail {
    val ratings = optJSONObject("ratings")
    val individualRatings = ratings?.optJSONArray("individual")?.let { values ->
        List(values.length()) { index -> values.optInt(index) }
    }.orEmpty()
    return RecipeDetail(
        id = getString("id"),
        name = getString("name"),
        minutes = optionalInt("minutes"),
        ingredients = stringList("ingredients"),
        instructions = if (isNull("instructions")) null else stringList("instructions"),
        cuisines = stringList("cuisines"),
        ratings = individualRatings,
        ratingAggregate = ratings?.takeUnless { it.isNull("aggregate") }?.optDouble("aggregate")
    )
}

internal fun searchRequestPayload(criteria: ParseResult, cursor: String?): Map<String, Any?> = mapOf(
    "included" to criteria.included,
    "excluded" to criteria.excluded,
    "excludedCategories" to criteria.excludedCategories,
    "cuisines" to emptyList<String>(),
    "maxMinutes" to null,
    "cursor" to cursor
)

internal fun JSONObject.toSessionTokens() = SessionTokens(
    sessionId = getString("sessionId"),
    accessToken = getString("accessToken"),
    refreshToken = getString("refreshToken")
)

internal fun JSONObject.toFavorites(): List<FavoriteRecipe> {
    val values = optJSONArray("favorites") ?: JSONArray()
    return List(values.length()) { index ->
        val item = values.getJSONObject(index)
        FavoriteRecipe(
            id = item.getString("id"),
            name = item.getString("name"),
            minutes = item.optionalInt("minutes"),
            ingredientNames = item.stringList("ingredientNames")
        )
    }
}

internal fun JSONObject.optionalInt(key: String): Int? =
    if (isNull(key) || !has(key)) null else optInt(key)

internal fun JSONObject.optionalString(key: String): String? =
    if (isNull(key) || !has(key)) null else optString(key).takeIf(String::isNotBlank)

internal fun String.toApiError(statusCode: Int): ApiError {
    val envelope = runCatching { JSONObject(this).optJSONObject("error") }.getOrNull()
    val fallbackCode = when (statusCode) {
        404 -> "NOT_FOUND"
        in 500..599 -> "SERVICE_UNAVAILABLE"
        else -> "REQUEST_FAILED"
    }
    return ApiError(
        code = envelope?.optString("code")?.takeIf(String::isNotBlank) ?: fallbackCode,
        message = envelope?.optString("message")?.takeIf(String::isNotBlank)
            ?: "The request could not be completed. Please try again."
    )
}

private fun String.encodePathSegment(): String =
    java.net.URLEncoder.encode(this, Charsets.UTF_8.name()).replace("+", "%20")
