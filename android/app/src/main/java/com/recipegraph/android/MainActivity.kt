package com.recipegraph.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.recipegraph.android.data.ApiError
import com.recipegraph.android.data.ApiResult
import com.recipegraph.android.data.FavoriteRecipe
import com.recipegraph.android.data.KeystoreTokenStore
import com.recipegraph.android.data.UrlConnectionTransport
import com.recipegraph.android.data.requiresSignIn
import com.recipegraph.android.data.ParseResult
import com.recipegraph.android.data.RecipeDataSource
import com.recipegraph.android.data.RecipeDetail
import com.recipegraph.android.data.RecipeRepository
import com.recipegraph.android.data.RecipeSummary
import com.recipegraph.android.ui.AccountScreen
import com.recipegraph.android.ui.FavoritesScreen
import com.recipegraph.android.ui.Rf
import com.recipegraph.android.ui.RfTab
import com.recipegraph.android.ui.RecipeFinderTheme
import com.recipegraph.android.ui.RegisterScreen
import com.recipegraph.android.ui.RecipeDetailScreen
import com.recipegraph.android.ui.RecipeResultsScreen
import com.recipegraph.android.ui.SearchScreen
import com.recipegraph.android.ui.SignInScreen
import com.recipegraph.android.ui.ThemePreferenceStore
import com.recipegraph.android.ui.VerifyScreen
import com.recipegraph.android.ui.WelcomeScreen
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val context = LocalContext.current
            val repository = remember { RecipeRepository(UrlConnectionTransport(BuildConfig.API_BASE_URL), KeystoreTokenStore(context)) }
            val themeStore = remember { ThemePreferenceStore(context) }
            RecipeFinderTheme(themeMode = themeStore.themeMode) {
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
    var signedIn by remember { mutableStateOf(repository.hasStoredSession()) }
    var sessionChecked by remember { mutableStateOf(!repository.hasStoredSession()) }
    var favorites by remember { mutableStateOf<List<FavoriteRecipe>>(emptyList()) }
    var favoritesLoaded by remember { mutableStateOf(false) }
    var myRating by remember { mutableStateOf<Int?>(null) }
    var searchIngredients by rememberSaveable { mutableStateOf("") }
    var parsedText by remember { mutableStateOf<String?>(null) }
    var parsedIngredients by remember { mutableStateOf(ParseResult(emptyList(), emptyList(), emptyList(), emptyList())) }
    var searchResults by remember { mutableStateOf<List<RecipeSummary>>(emptyList()) }
    var searchCursor by remember { mutableStateOf<String?>(null) }
    var loadingMore by remember { mutableStateOf(false) }
    var searching by remember { mutableStateOf(false) }
    var minRating by rememberSaveable { mutableStateOf<Int?>(null) }
    var recipeDetail by remember { mutableStateOf<RecipeDetail?>(null) }

    fun returnToSignIn(message: String?) {
        signedIn = false
        favorites = emptyList()
        favoritesLoaded = false
        myRating = null
        recipeDetail = null
        email = ""
        username = ""
        apiError = message
        navController.navigate("signIn") {
            popUpTo(navController.graph.id) { inclusive = true }
        }
    }

    fun openTab(tab: RfTab) {
        val route = when (tab) {
            RfTab.Search -> "search"
            RfTab.Favorites -> "favorites"
            RfTab.Account -> "account"
        }
        navController.navigate(route) {
            popUpTo("search") { inclusive = false }
            launchSingleTop = true
        }
    }

    /** Shows a failure, or returns to sign-in when the session can no longer be used. */
    fun handleFailure(error: ApiError) {
        if (error.requiresSignIn()) returnToSignIn(error.message) else apiError = error.message
    }

    // Restore a stored session on start; the profile call proves the tokens still work.
    LaunchedEffect(Unit) {
        if (repository.hasStoredSession()) {
            isLoading = true
            when (val result = repository.getProfile()) {
                is ApiResult.Success -> {
                    email = result.value.email
                    username = result.value.username
                    signedIn = true
                    navController.navigate("search") { popUpTo("welcome") { inclusive = true } }
                }
                is ApiResult.Failure -> if (result.error.requiresSignIn()) {
                    signedIn = false
                } else {
                    apiError = result.error.message
                }
            }
            isLoading = false
        }
        sessionChecked = true
    }

    Column(modifier = Modifier.fillMaxSize().background(Rf.colors.surface)) {
        Box(modifier = Modifier.fillMaxWidth().height(4.dp)) {
            if (isLoading) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Loading" },
                    color = Rf.colors.primary,
                    trackColor = Rf.colors.primaryContainer
                )
            }
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
                    onSignInClick = { navController.navigate("signIn") },
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
                    onSignIn = { emailInput, passwordInput ->
                        apiError = null
                        scope.launch {
                            isLoading = true
                            when (val result = repository.signIn(emailInput, passwordInput, android.os.Build.MODEL)) {
                                is ApiResult.Success -> when (val profile = repository.getProfile()) {
                                    is ApiResult.Success -> {
                                        email = profile.value.email
                                        username = profile.value.username
                                        signedIn = true
                                        navController.navigate("search") { popUpTo("welcome") { inclusive = true } }
                                    }
                                    is ApiResult.Failure -> handleFailure(profile.error)
                                }
                                is ApiResult.Failure -> apiError = result.error.message
                            }
                            isLoading = false
                        }
                    },
                    onRegisterClick = { navController.navigate("register") },
                    onBack = if (navController.previousBackStackEntry != null) {
                        { navController.popBackStack() }
                    } else null,
                    errorMessage = apiError
                )
            }

            composable("search") {
                if (!signedIn) {
                    LaunchedEffect(Unit) { returnToSignIn(null) }
                } else SearchScreen(
                    ingredientsText = searchIngredients,
                    parsedIngredients = parsedIngredients,
                    isReadyToSearch = parsedText == searchIngredients && searchIngredients.isNotBlank(),
                    isSearching = searching,
                    minRating = minRating,
                    onMinRatingChange = {
                        minRating = it
                        searchResults = emptyList()
                        searchCursor = null
                    },
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
                        if (parsedText == searchIngredients && searchIngredients.isNotBlank() && !searching) {
                            apiError = null
                            searchResults = emptyList()
                            searchCursor = null
                            if (parsedIngredients.included.isEmpty()) {
                                apiError = "Add at least one ingredient to search."
                            } else {
                                scope.launch {
                                    searching = true
                                    when (val result = repository.searchRecipes(parsedIngredients, minRating, null)) {
                                        is ApiResult.Success -> {
                                            searchResults = result.value.recipes
                                            searchCursor = result.value.nextCursor
                                            navController.navigate("results")
                                        }
                                        is ApiResult.Failure -> apiError = result.error.message
                                    }
                                    searching = false
                                }
                            }
                        }
                    },
                    onNavigate = ::openTab,
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
                if (!signedIn) {
                    LaunchedEffect(Unit) { returnToSignIn(null) }
                } else RecipeResultsScreen(
                    recipes = searchResults,
                    criteriaSummary = parsedIngredients.included.joinToString(" · "),
                    unrecognized = parsedIngredients.unrecognized,
                    onNavigate = ::openTab,
                    onRecipeClick = { recipe ->
                        recipeDetail = null
                        navController.navigate("detail/${android.net.Uri.encode(recipe.id)}")
                    },
                    onLoadMore = {
                        val cursor = searchCursor
                        if (cursor != null && !loadingMore) {
                            scope.launch {
                                apiError = null
                                loadingMore = true
                                when (val result = repository.searchRecipes(parsedIngredients, minRating, cursor)) {
                                    is ApiResult.Success -> {
                                        searchResults = searchResults + result.value.recipes
                                        searchCursor = result.value.nextCursor
                                    }
                                    is ApiResult.Failure -> apiError = result.error.message
                                }
                                loadingMore = false
                            }
                        }
                    },
                    onBack = { navController.popBackStack() },
                    isLoadingMore = loadingMore,
                    hasMore = searchCursor != null,
                    errorMessage = apiError
                )
            }

            composable("detail/{recipeId}") { entry ->
                val recipeId = entry.arguments?.getString("recipeId").orEmpty()
                if (!signedIn) {
                    LaunchedEffect(Unit) { returnToSignIn(null) }
                } else {
                    LaunchedEffect(recipeId) {
                        recipeDetail = null
                        myRating = null
                        apiError = null
                        isLoading = true
                        when (val result = repository.getRecipe(recipeId)) {
                            is ApiResult.Success -> recipeDetail = result.value
                            is ApiResult.Failure -> apiError = result.error.message
                        }
                        if (recipeDetail != null) {
                            when (val result = repository.getMyRating(recipeId)) {
                                is ApiResult.Success -> myRating = result.value
                                is ApiResult.Failure -> handleFailure(result.error)
                            }
                            when (val result = repository.listFavorites()) {
                                is ApiResult.Success -> {
                                    favorites = result.value
                                    favoritesLoaded = true
                                }
                                is ApiResult.Failure -> handleFailure(result.error)
                            }
                        }
                        isLoading = false
                    }
                    RecipeDetailScreen(
                        recipe = recipeDetail,
                        onBack = { navController.popBackStack() },
                        onNavigate = ::openTab,
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
                        isFavorite = favorites.any { it.id == recipeId },
                        myRating = myRating,
                        onToggleFavorite = {
                            apiError = null
                            val wasFavorite = favorites.any { it.id == recipeId }
                            scope.launch {
                                isLoading = true
                                val result = if (wasFavorite) {
                                    repository.removeFavorite(recipeId)
                                } else {
                                    repository.addFavorite(recipeId)
                                }
                                when (result) {
                                    is ApiResult.Success -> when (val list = repository.listFavorites()) {
                                        is ApiResult.Success -> {
                                            favorites = list.value
                                            favoritesLoaded = true
                                        }
                                        is ApiResult.Failure -> handleFailure(list.error)
                                    }
                                    is ApiResult.Failure -> handleFailure(result.error)
                                }
                                isLoading = false
                            }
                        },
                        onRateRecipe = { value ->
                            apiError = null
                            scope.launch {
                                isLoading = true
                                when (val result = repository.setRating(recipeId, value)) {
                                    is ApiResult.Success -> myRating = value
                                    is ApiResult.Failure -> handleFailure(result.error)
                                }
                                isLoading = false
                            }
                        },
                        onClearRating = {
                            apiError = null
                            scope.launch {
                                isLoading = true
                                when (val result = repository.removeRating(recipeId)) {
                                    is ApiResult.Success -> myRating = null
                                    is ApiResult.Failure -> handleFailure(result.error)
                                }
                                isLoading = false
                            }
                        },
                        errorMessage = apiError
                    )
                }
            }

            composable("favorites") {
                if (!signedIn) {
                    LaunchedEffect(Unit) { returnToSignIn(null) }
                } else {
                    LaunchedEffect(Unit) {
                        apiError = null
                        isLoading = true
                        when (val result = repository.listFavorites()) {
                            is ApiResult.Success -> {
                                favorites = result.value
                                favoritesLoaded = true
                            }
                            is ApiResult.Failure -> handleFailure(result.error)
                        }
                        isLoading = false
                    }
                    FavoritesScreen(
                        favorites = favorites,
                        isLoaded = favoritesLoaded,
                        onOpen = { recipe ->
                            recipeDetail = null
                            navController.navigate("detail/${android.net.Uri.encode(recipe.id)}")
                        },
                        onRemove = { recipe ->
                            apiError = null
                            scope.launch {
                                isLoading = true
                                when (val result = repository.removeFavorite(recipe.id)) {
                                    is ApiResult.Success -> favorites = favorites.filterNot { it.id == recipe.id }
                                    is ApiResult.Failure -> handleFailure(result.error)
                                }
                                isLoading = false
                            }
                        },
                        onNavigate = ::openTab,
                        errorMessage = apiError
                    )
                }
            }

            composable("account") {
                if (!signedIn) {
                    LaunchedEffect(Unit) { returnToSignIn(null) }
                } else AccountScreen(
                    email = email,
                    username = username,
                    themeMode = themeStore.themeMode,
                    onThemeChanged = { themeStore.setTheme(it) },
                    onSignOut = {
                        scope.launch {
                            isLoading = true
                            repository.signOut() // local tokens are cleared even if the server is unreachable
                            isLoading = false
                            returnToSignIn(null)
                        }
                    },
                    onDeleteAccount = {
                        apiError = null
                        scope.launch {
                            isLoading = true
                            when (val result = repository.deleteAccount()) {
                                is ApiResult.Success -> returnToSignIn(null)
                                is ApiResult.Failure -> handleFailure(result.error)
                            }
                            isLoading = false
                        }
                    },
                    onNavigate = ::openTab,
                    errorMessage = apiError
                )
            }
        }
    }
}
