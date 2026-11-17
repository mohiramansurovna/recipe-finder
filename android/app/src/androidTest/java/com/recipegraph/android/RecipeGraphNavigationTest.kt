package com.recipegraph.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.recipegraph.android.data.AccountProfile
import com.recipegraph.android.data.ApiError
import com.recipegraph.android.data.FavoriteRecipe
import com.recipegraph.android.data.ApiResult
import com.recipegraph.android.data.ParseResult
import com.recipegraph.android.data.RecipeDataSource
import com.recipegraph.android.data.RecipeDetail
import com.recipegraph.android.data.SearchResult
import com.recipegraph.android.data.RecipeSummary
import com.recipegraph.android.ui.ThemePreferenceStore
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RecipeGraphNavigationTest {
    @get:Rule
    // Hosts only the fake-backed app, so the tests never touch the real MainActivity, Keystore session or network.
    val composeRule = createComposeRule()

    @Test
    fun successfulRegistrationOpensVerificationScreen() {
        launchApp(FakeRecipeDataSource(registrationResult = ApiResult.Success(Unit)))

        composeRule.onNodeWithTag("welcome-register").performClick()
        composeRule.onNodeWithTag("register-email").performTextInput("demo@example.test")
        composeRule.onNodeWithTag("register-username").performTextInput("recipe_user")
        composeRule.onNodeWithTag("register-password").performTextInput("long-enough-password")
        composeRule.onNodeWithTag("register-submit").performClick()

        // "Verify email" is both the screen title and the submit button label.
        composeRule.onNodeWithTag("verification-submit").assertExists()
        assert(composeRule.onAllNodesWithText("Verify email").fetchSemanticsNodes().isNotEmpty())
        composeRule.onNodeWithText("Resend code").performClick()
        composeRule.onNodeWithText("If the account is eligible, a verification email will be sent.").assertExists()
        composeRule.onNodeWithTag("verification-code").performTextInput("12345678")
        composeRule.onNodeWithTag("verification-submit").performClick()
        composeRule.onNodeWithTag("signin-submit").assertExists()
    }

    @Test
    fun registrationFailureStaysOnScreenAndShowsApiMessage() {
        launchApp(
            FakeRecipeDataSource(
                registrationResult = ApiResult.Failure(
                    ApiError("ACCOUNT_ALREADY_EXISTS", "An account with that email or username already exists.")
                )
            )
        )

        composeRule.onNodeWithTag("welcome-register").performClick()
        composeRule.onNodeWithTag("register-email").performTextInput("demo@example.test")
        composeRule.onNodeWithTag("register-username").performTextInput("recipe_user")
        composeRule.onNodeWithTag("register-password").performTextInput("long-enough-password")
        composeRule.onNodeWithTag("register-submit").performClick()

        composeRule.onNodeWithText("An account with that email or username already exists.").assertExists()
        composeRule.onNodeWithTag("register-submit").assertExists()
    }

    @Test
    fun failedSignInStaysOnSignInAndNeverExposesProtectedScreens() {
        launchApp(
            FakeRecipeDataSource(
                signInResult = ApiResult.Failure(ApiError("INVALID_CREDENTIALS", "Email or password is incorrect."))
            )
        )

        composeRule.onNodeWithTag("welcome-signin").performClick()
        composeRule.onNodeWithTag("signin-email").performTextInput("demo@example.test")
        composeRule.onNodeWithTag("signin-password").performTextInput("long-enough-password")
        composeRule.onNodeWithTag("signin-submit").performClick()

        composeRule.onNodeWithText("Email or password is incorrect.").assertExists()
        composeRule.onNodeWithText("Search recipes").assertDoesNotExist()
    }

    @Test
    fun successfulSignInOpensSearch() {
        launchApp(FakeRecipeDataSource())

        composeRule.onNodeWithTag("welcome-signin").performClick()
        composeRule.onNodeWithTag("signin-email").performTextInput("demo@example.test")
        composeRule.onNodeWithTag("signin-password").performTextInput("long-enough-password")
        composeRule.onNodeWithTag("signin-submit").performClick()

        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("Search recipes").fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun onlyExcludedTermsAskForAnIngredientAndSkipTheSearch() {
        val repository = FakeRecipeDataSource(parseResult = ParseResult(emptyList(), listOf("milk"), emptyList(), emptyList()))
        launchApp(repository)
        signInAndParse("no milk")

        composeRule.onNodeWithText("Search recipes").performClick()

        composeRule.onNodeWithText("Add at least one ingredient to search.").assertExists()
        assert(repository.searchCalls == 0)
    }

    @Test
    fun firstSearchShowsProgressWithLoadingText() {
        val repository = FakeRecipeDataSource(searchDelayMs = 1_500)
        launchApp(repository)
        signInAndParse("chicken")

        composeRule.onNodeWithText("Search recipes").performClick()

        composeRule.waitUntil(2_000) { composeRule.onAllNodesWithTag("search-progress").fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNodeWithText("Finding recipes…").assertExists()
        composeRule.onNodeWithText("Search recipes").assertDoesNotExist()
        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("Recipes for you").fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun minimumRatingChoiceIsSentWithTheSearch() {
        val repository = FakeRecipeDataSource()
        launchApp(repository)
        signInAndParse("chicken")

        composeRule.onNodeWithText("4+ stars").performClick()
        composeRule.onNodeWithText("Recipes without ratings are hidden.").assertExists()
        composeRule.onNodeWithText("Search recipes").performClick()

        composeRule.waitUntil(5_000) { repository.searchCalls == 1 }
        assert(repository.lastMinRating == 4)
    }

    private fun signInAndParse(ingredients: String) {
        composeRule.onNodeWithTag("welcome-signin").performClick()
        composeRule.onNodeWithTag("signin-email").performTextInput("demo@example.test")
        composeRule.onNodeWithTag("signin-password").performTextInput("long-enough-password")
        composeRule.onNodeWithTag("signin-submit").performClick()
        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithTag("ingredients-input").fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNodeWithTag("ingredients-input").performTextInput(ingredients)
        composeRule.onNodeWithText("Parse ingredients").performClick()
        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("YOUR INGREDIENTS · TAP TO EDIT").fetchSemanticsNodes().isNotEmpty() }
    }

    private fun launchApp(repository: RecipeDataSource) {
        val themeStore = ThemePreferenceStore(ApplicationProvider.getApplicationContext())
        composeRule.setContent {
            MaterialTheme {
                RecipeGraphApp(repository = repository, themeStore = themeStore)
            }
        }
    }

    private class FakeRecipeDataSource(
        private val registrationResult: ApiResult<Unit> = ApiResult.Success(Unit),
        private val signInResult: ApiResult<Unit> = ApiResult.Success(Unit),
        private val parseResult: ParseResult = ParseResult(listOf("chicken"), emptyList(), emptyList(), emptyList()),
        private val searchDelayMs: Long = 0
    ) : RecipeDataSource {
        @Volatile var searchCalls = 0
        @Volatile var lastMinRating: Int? = null

        override fun hasStoredSession() = false
        override suspend fun signIn(email: String, password: String, deviceName: String) = signInResult
        override suspend fun signOut(): ApiResult<Unit> = ApiResult.Success(Unit)
        override suspend fun getProfile(): ApiResult<AccountProfile> =
            ApiResult.Success(AccountProfile("demo@example.test", "recipe_user"))
        override suspend fun deleteAccount(): ApiResult<Unit> = ApiResult.Success(Unit)
        override suspend fun listFavorites(): ApiResult<List<FavoriteRecipe>> = ApiResult.Success(emptyList())
        override suspend fun addFavorite(recipeId: String): ApiResult<Unit> = ApiResult.Success(Unit)
        override suspend fun removeFavorite(recipeId: String): ApiResult<Unit> = ApiResult.Success(Unit)
        override suspend fun getMyRating(recipeId: String): ApiResult<Int?> = ApiResult.Success(null)
        override suspend fun setRating(recipeId: String, rating: Int): ApiResult<Unit> = ApiResult.Success(Unit)
        override suspend fun removeRating(recipeId: String): ApiResult<Unit> = ApiResult.Success(Unit)
        override suspend fun register(email: String, username: String, password: String) = registrationResult
        override suspend fun verify(email: String, code: String) = ApiResult.Success(Unit)
        override suspend fun resendVerification(email: String) = ApiResult.Success(Unit)
        override suspend fun parseIngredients(text: String) = ApiResult.Success(parseResult)
        override suspend fun searchRecipes(criteria: ParseResult, minRating: Int?, cursor: String?): ApiResult<SearchResult> {
            kotlinx.coroutines.delay(searchDelayMs)
            searchCalls += 1
            lastMinRating = minRating
            return ApiResult.Success(SearchResult(emptyList<RecipeSummary>(), 0, null))
        }
        override suspend fun getRecipe(recipeId: String): ApiResult<RecipeDetail> =
            ApiResult.Failure(ApiError("RECIPE_NOT_FOUND", "The requested recipe was not found."))
    }
}
