package com.recipegraph.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.recipegraph.android.data.ApiError
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
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun successfulRegistrationOpensVerificationScreen() {
        launchApp(FakeRecipeDataSource(registrationResult = ApiResult.Success(Unit)))

        composeRule.onNodeWithTag("welcome-register").performClick()
        composeRule.onNodeWithTag("register-email").performTextInput("demo@example.test")
        composeRule.onNodeWithTag("register-username").performTextInput("recipe_user")
        composeRule.onNodeWithTag("register-password").performTextInput("long-enough-password")
        composeRule.onNodeWithTag("register-submit").performClick()

        composeRule.onNodeWithText("Verify email").assertExists()
        composeRule.onNodeWithText("Resend code").performClick()
        composeRule.onNodeWithText("If the account is eligible, a verification email will be sent.").assertExists()
        composeRule.onNodeWithTag("verification-code").performTextInput("12345678")
        composeRule.onNodeWithTag("verification-submit").performClick()
        composeRule.onNodeWithText("Sign-in and session services are not available yet. No local session will be created.")
            .assertExists()
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
        composeRule.onNodeWithText("Create account").assertExists()
    }

    @Test
    fun signInUnavailableDoesNotExposeSearchOrFavorites() {
        launchApp(FakeRecipeDataSource())

        composeRule.onNodeWithTag("welcome-signin").performClick()
        composeRule.onNodeWithText("Continue").performClick()

        composeRule.onNodeWithText("Search recipes").assertDoesNotExist()
        composeRule.onNodeWithText("Favorites").assertDoesNotExist()
        composeRule.onNodeWithText("Sign-in and session services are not available yet. No local session will be created.")
            .assertExists()
    }

    private fun launchApp(repository: RecipeDataSource) {
        val themeStore = ThemePreferenceStore(composeRule.activity)
        composeRule.setContent {
            MaterialTheme {
                RecipeGraphApp(repository = repository, themeStore = themeStore)
            }
        }
    }

    private class FakeRecipeDataSource(
        private val registrationResult: ApiResult<Unit> = ApiResult.Success(Unit)
    ) : RecipeDataSource {
        override suspend fun register(email: String, username: String, password: String) = registrationResult
        override suspend fun verify(email: String, code: String) = ApiResult.Success(Unit)
        override suspend fun resendVerification(email: String) = ApiResult.Success(Unit)
        override fun signInUnavailable() =
            ApiResult.Failure(ApiError("UNAVAILABLE", "Sign-in and session routes are not yet available."))
        override suspend fun parseIngredients(text: String) =
            ApiResult.Success(ParseResult(emptyList(), emptyList(), emptyList(), emptyList()))
        override suspend fun searchRecipes(criteria: ParseResult, cursor: String?) =
            ApiResult.Success(SearchResult(emptyList<RecipeSummary>(), 0, null))
        override suspend fun getRecipe(recipeId: String): ApiResult<RecipeDetail> =
            ApiResult.Failure(ApiError("RECIPE_NOT_FOUND", "The requested recipe was not found."))
    }
}
