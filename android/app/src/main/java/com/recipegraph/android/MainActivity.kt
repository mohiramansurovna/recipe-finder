package com.recipegraph.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.recipegraph.android.data.ApiResult
import com.recipegraph.android.data.ParseResult
import com.recipegraph.android.data.RecipeDataSource
import com.recipegraph.android.data.RecipeDetail
import com.recipegraph.android.data.RecipeRepository
import com.recipegraph.android.data.RecipeSummary
import com.recipegraph.android.ui.AccountScreen
import com.recipegraph.android.ui.FavoritesScreen
import com.recipegraph.android.ui.RegisterScreen
import com.recipegraph.android.ui.RecipeDetailScreen
import com.recipegraph.android.ui.RecipeResultsScreen
import com.recipegraph.android.ui.SearchScreen
import com.recipegraph.android.ui.SignInScreen
import com.recipegraph.android.ui.ProtectedUnavailableScreen
import com.recipegraph.android.ui.ThemeMode
import com.recipegraph.android.ui.ThemePreferenceStore
import com.recipegraph.android.ui.VerifyScreen
import com.recipegraph.android.ui.WelcomeScreen
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val context = LocalContext.current
            val repository = remember { RecipeRepository(BuildConfig.API_BASE_URL) }
            val themeStore = remember { ThemePreferenceStore(context) }
            RecipeGraphTheme(themeMode = themeStore.themeMode) {
                RecipeGraphApp(repository = repository, themeStore = themeStore)
            }
        }
    }
}

@Composable
fun RecipeGraphApp(
    repository: RecipeDataSource,
    themeStore: ThemePreferenceStore
) {
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var apiError by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    val sessionRoutesAvailable = false
    var searchIngredients by rememberSaveable { mutableStateOf("") }
    var parsedText by remember { mutableStateOf<String?>(null) }
    var parsedIngredients by remember { mutableStateOf(ParseResult(emptyList(), emptyList(), emptyList(), emptyList())) }
    var searchResults by remember { mutableStateOf<List<RecipeSummary>>(emptyList()) }
    var searchCursor by remember { mutableStateOf<String?>(null) }
    var recipeDetail by remember { mutableStateOf<RecipeDetail?>(null) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        if (isLoading) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            Text("Loading…", style = MaterialTheme.typography.labelLarge)
        }

        NavHost(
            navController = navController,
            startDestination = "welcome",
            modifier = Modifier.weight(1f)
        ) {
            composable("welcome") {
                WelcomeScreen(
                    onRegisterClick = { navController.navigate("register") },
                    onSignInClick = { navController.navigate("signIn") },
                    onOpenDemo = {
                        apiError = "Use synthetic disposable accounts only. Do not enter personal data."
                    },
                    errorMessage = apiError
                )
            }

            composable("register") {
                RegisterScreen(
                    onRegister = { emailInput, usernameInput, passwordInput ->
                        email = emailInput
                        username = usernameInput
                        apiError = null
                        scope.launch {
                            isLoading = true
                            when (val result = repository.register(emailInput, usernameInput, passwordInput)) {
                                is ApiResult.Success -> navController.navigate("verify")
                                is ApiResult.Failure -> apiError = result.error.message
                            }
                            isLoading = false
                        }
                    },
                    onBack = { navController.popBackStack() },
                    errorMessage = apiError
                )
            }

            composable("verify") {
                VerifyScreen(
                    email = email,
                    onVerify = { code ->
                        apiError = null
                        scope.launch {
                            isLoading = true
                            when (val result = repository.verify(email, code)) {
                                is ApiResult.Success -> navController.navigate("signIn")
                                is ApiResult.Failure -> apiError = result.error.message
                            }
                            isLoading = false
                        }
                    },
                    onResend = {
                        apiError = null
                        scope.launch {
                            isLoading = true
                            when (val result = repository.resendVerification(email)) {
                                is ApiResult.Success -> apiError =
                                    "If the account is eligible, a verification email will be sent."
                                is ApiResult.Failure -> apiError = result.error.message
                            }
                            isLoading = false
                        }
                    },
                    onBack = { navController.popBackStack() },
                    errorMessage = apiError
                )
            }

            composable("signIn") {
                SignInScreen(
                    onSignIn = { _, _ ->
                        val result = repository.signInUnavailable()
                        apiError = (result as ApiResult.Failure).error.message
                    },
                    onRegisterClick = { navController.navigate("register") },
                    errorMessage = apiError
                )
            }

            composable("search") {
                if (!sessionRoutesAvailable) {
                    ProtectedUnavailableScreen { navController.popBackStack() }
                } else SearchScreen(
                    ingredientsText = searchIngredients,
                    parsedIngredients = parsedIngredients,
                    isReadyToSearch = parsedText == searchIngredients && searchIngredients.isNotBlank(),
                    onIngredientsChange = {
                        searchIngredients = it
                        parsedText = null
                        searchResults = emptyList()
                        searchCursor = null
                    },
                    onParse = {
                        apiError = null
                        val textToParse = searchIngredients
                        scope.launch {
                            isLoading = true
                            when (val result = repository.parseIngredients(textToParse)) {
                                is ApiResult.Success -> {
                                    parsedIngredients = result.value
                                    parsedText = textToParse
                                    searchResults = emptyList()
                                    searchCursor = null
                                }
                                is ApiResult.Failure -> apiError = result.error.message
                            }
                            isLoading = false
                        }
                    },
                    onUpdateTerm = { section, oldTerm, newTerm ->
                        parsedIngredients = parsedIngredients.updateTerm(section, oldTerm, newTerm)
                        searchResults = emptyList()
                        searchCursor = null
                    },
                    onRemoveTerm = { section, term ->
                        parsedIngredients = parsedIngredients.removeTerm(section, term)
                        searchResults = emptyList()
                        searchCursor = null
                    },
                    onSearch = {
                        if (parsedText == searchIngredients && searchIngredients.isNotBlank()) {
                            apiError = null
                            searchResults = emptyList()
                            searchCursor = null
                            scope.launch {
                                isLoading = true
                                when (val result = repository.searchRecipes(parsedIngredients, null)) {
                                    is ApiResult.Success -> {
                                        searchResults = result.value.recipes
                                        searchCursor = result.value.nextCursor
                                        navController.navigate("results")
                                    }
                                    is ApiResult.Failure -> apiError = result.error.message
                                }
                                isLoading = false
                            }
                        }
                    },
                    onOpenFavorites = { navController.navigate("favorites") },
                    onOpenAccount = { navController.navigate("account") },
                    onBack = { navController.popBackStack() },
                    onClearSearch = {
                        searchIngredients = ""
                        parsedIngredients = ParseResult(emptyList(), emptyList(), emptyList(), emptyList())
                        parsedText = null
                        searchResults = emptyList()
                        searchCursor = null
                        apiError = null
                    },
                    errorMessage = apiError
                )
            }

            composable("results") {
                if (!sessionRoutesAvailable) {
                    ProtectedUnavailableScreen { navController.popBackStack() }
                } else RecipeResultsScreen(
                    recipes = searchResults,
                    onRecipeClick = { recipe ->
                        recipeDetail = null
                        navController.navigate("detail/${android.net.Uri.encode(recipe.id)}")
                    },
                    onLoadMore = {
                        val cursor = searchCursor
                        if (cursor != null) {
                            scope.launch {
                                apiError = null
                                isLoading = true
                                when (val result = repository.searchRecipes(parsedIngredients, cursor)) {
                                    is ApiResult.Success -> {
                                        searchResults = searchResults + result.value.recipes
                                        searchCursor = result.value.nextCursor
                                    }
                                    is ApiResult.Failure -> apiError = result.error.message
                                }
                                isLoading = false
                            }
                        }
                    },
                    onBack = { navController.popBackStack() },
                    hasMore = searchCursor != null,
                    errorMessage = apiError
                )
            }

            composable("detail/{recipeId}") { entry ->
                val recipeId = entry.arguments?.getString("recipeId").orEmpty()
                if (!sessionRoutesAvailable) {
                    ProtectedUnavailableScreen { navController.popBackStack() }
                } else {
                    LaunchedEffect(recipeId) {
                        recipeDetail = null
                        apiError = null
                        isLoading = true
                        when (val result = repository.getRecipe(recipeId)) {
                            is ApiResult.Success -> recipeDetail = result.value
                            is ApiResult.Failure -> apiError = result.error.message
                        }
                        isLoading = false
                    }
                    RecipeDetailScreen(
                        recipe = recipeDetail,
                        onBack = { navController.popBackStack() },
                        onRetry = {
                            scope.launch {
                                isLoading = true
                                when (val result = repository.getRecipe(recipeId)) {
                                    is ApiResult.Success -> {
                                        recipeDetail = result.value
                                        apiError = null
                                    }
                                    is ApiResult.Failure -> apiError = result.error.message
                                }
                                isLoading = false
                            }
                        },
                        onToggleFavorite = {
                            apiError = "Favorites are unavailable until the protected backend routes are added."
                        },
                        onRateRecipe = {
                            apiError = "Ratings are unavailable until the account-backed route is shipped."
                        },
                        errorMessage = apiError
                    )
                }
            }

            composable("favorites") {
                if (!sessionRoutesAvailable) {
                    ProtectedUnavailableScreen { navController.popBackStack() }
                } else FavoritesScreen(
                    onBack = { navController.popBackStack() },
                    errorMessage = "Favorites are unavailable until the protected session-backed routes exist."
                )
            }

            composable("account") {
                if (!sessionRoutesAvailable) {
                    ProtectedUnavailableScreen { navController.popBackStack() }
                } else AccountScreen(
                    email = email,
                    username = username,
                    themeMode = themeStore.themeMode,
                    onThemeChanged = { themeStore.setTheme(it) },
                    onSignOut = {
                        apiError = "Sign-out is unavailable until a session endpoint exists."
                    },
                    onDeleteAccount = {
                        apiError = "Account deletion is unavailable until the backend route is shipped."
                    },
                    onBack = { navController.popBackStack() },
                    errorMessage = apiError
                )
            }
        }
    }
}

@Composable
private fun RecipeGraphTheme(themeMode: ThemeMode, content: @Composable () -> Unit) {
    val darkTheme = when (themeMode) {
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
        ThemeMode.System -> androidx.compose.foundation.isSystemInDarkTheme()
    }
    val colors = if (darkTheme) {
        androidx.compose.material3.darkColorScheme(
            primary = androidx.compose.ui.graphics.Color(0xFFB7D7A8),
            secondary = androidx.compose.ui.graphics.Color(0xFFE7A96B),
            background = androidx.compose.ui.graphics.Color(0xFF171A16),
            surface = androidx.compose.ui.graphics.Color(0xFF20251F)
        )
    } else {
        androidx.compose.material3.lightColorScheme(
            primary = androidx.compose.ui.graphics.Color(0xFF466B3B),
            secondary = androidx.compose.ui.graphics.Color(0xFFB76536),
            background = androidx.compose.ui.graphics.Color(0xFFFAF8F3),
            surface = androidx.compose.ui.graphics.Color(0xFFFFFFFF)
        )
    }

    MaterialTheme(colorScheme = colors, content = content)
}
