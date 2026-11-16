package com.recipegraph.android.data

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

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

interface RecipeDataSource {
    suspend fun register(email: String, username: String, password: String): ApiResult<Unit>
    suspend fun verify(email: String, code: String): ApiResult<Unit>
    suspend fun resendVerification(email: String): ApiResult<Unit>
    fun signInUnavailable(): ApiResult<Unit>
    suspend fun parseIngredients(text: String): ApiResult<ParseResult>
    suspend fun searchRecipes(criteria: ParseResult, cursor: String?): ApiResult<SearchResult>
    suspend fun getRecipe(recipeId: String): ApiResult<RecipeDetail>
}

class RecipeRepository(
    private val apiBaseUrl: String
) : RecipeDataSource {
    override suspend fun register(email: String, username: String, password: String): ApiResult<Unit> =
        request(
            "/api/accounts/register",
            mapOf("email" to email.trim(), "username" to username.trim(), "password" to password)
        ) { Unit }

    override suspend fun verify(email: String, code: String): ApiResult<Unit> =
        request("/api/accounts/verify", mapOf("email" to email.trim(), "code" to code)) { Unit }

    override suspend fun resendVerification(email: String): ApiResult<Unit> =
        request("/api/accounts/resend-verification", mapOf("email" to email.trim())) { Unit }

    override fun signInUnavailable(): ApiResult<Unit> =
        ApiResult.Failure(ApiError("UNAVAILABLE", "Sign-in and session routes are not yet available."))

    override suspend fun parseIngredients(text: String): ApiResult<ParseResult> =
        request("/api/ingredients/parse", mapOf("text" to text), JSONObject::toParseResult)

    override suspend fun searchRecipes(criteria: ParseResult, cursor: String?): ApiResult<SearchResult> {
        return request("/api/recipes/search", searchRequestPayload(criteria, cursor), JSONObject::toSearchResult)
    }

    override suspend fun getRecipe(recipeId: String): ApiResult<RecipeDetail> =
        request("/api/recipes/${recipeId.encodePathSegment()}", null) { it.toRecipeDetail() }

    private suspend fun <T> request(
        path: String,
        body: Map<String, Any?>?,
        mapper: (JSONObject) -> T
    ): ApiResult<T> = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val url = URL(apiBaseUrl.trimEnd('/') + path)
            connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.connectTimeout = 12_000
            connection.readTimeout = 12_000
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(JSONObject(body).toString()) }
            }

            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (responseCode in 200..299) {
                ApiResult.Success(mapper(JSONObject(text)))
            } else {
                ApiResult.Failure(text.toApiError(responseCode))
            }
        } catch (exception: CancellationException) {
            throw exception
        } catch (exception: Exception) {
            Log.w("RecipeRepository", "API request failed: $path", exception)
            ApiResult.Failure(
                ApiError("SERVICE_UNAVAILABLE", "The backend is unavailable. Check the API base URL and try again.")
            )
        } finally {
            connection?.disconnect()
        }
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
