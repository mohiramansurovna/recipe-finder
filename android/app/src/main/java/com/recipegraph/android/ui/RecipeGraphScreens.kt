package com.recipegraph.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.recipegraph.android.data.AccountInputValidator
import com.recipegraph.android.data.FavoriteRecipe
import com.recipegraph.android.data.ParseResult
import com.recipegraph.android.data.RecipeDetail
import com.recipegraph.android.data.RecipeSummary

@Composable
fun WelcomeScreen(
    onRegisterClick: () -> Unit,
    onSignInClick: () -> Unit,
    onOpenDemo: () -> Unit,
    errorMessage: String?
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        Text("Recipe Graph", style = MaterialTheme.typography.headlineLarge)
        Text("Ingredient-first recipe discovery for staff demos.", style = MaterialTheme.typography.bodyLarge)
        Text("Use synthetic disposable credentials for the demo backend.", color = MaterialTheme.colorScheme.primary)
        errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = onRegisterClick, modifier = Modifier.fillMaxWidth().testTag("welcome-register")) { Text("Create account") }
        Button(onClick = onSignInClick, modifier = Modifier.fillMaxWidth().testTag("welcome-signin")) { Text("Sign in") }
        Button(onClick = onOpenDemo, modifier = Modifier.fillMaxWidth()) { Text("Demo safety") }
        Text(
            "INTERNAL DEMO  ·  SAMPLE DATA ONLY",
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
fun RegisterScreen(
    onRegister: (String, String, String) -> Unit,
    onBack: () -> Unit,
    errorMessage: String?
) {
    var email by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Create account", style = MaterialTheme.typography.headlineMedium)
        Text("Use a synthetic disposable email and a password of at least 12 characters.")
        OutlinedTextField(
            value = email,
            onValueChange = { email = it; validationError = null },
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("register-email")
        )
        OutlinedTextField(
            value = username,
            onValueChange = { username = it; validationError = null },
            label = { Text("Username") },
            supportingText = { Text("3–30 letters, numbers, or underscores") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("register-username")
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it; validationError = null },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("register-password")
        )
        (validationError ?: errorMessage)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = {
                validationError = AccountInputValidator.registrationError(email, username, password)
                if (validationError == null) {
                    onRegister(email, username, password)
                    password = ""
                }
            },
            modifier = Modifier.fillMaxWidth().testTag("register-submit")
        ) { Text("Create account") }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}

@Composable
fun VerifyScreen(
    email: String,
    onVerify: (String) -> Unit,
    onResend: () -> Unit,
    onBack: () -> Unit,
    errorMessage: String?
) {
    var code by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Verify email", style = MaterialTheme.typography.headlineMedium)
        Text("Enter the eight-digit code sent to $email.")
        OutlinedTextField(
            value = code,
            onValueChange = { input ->
                code = input.filter(Char::isDigit).take(8)
                validationError = null
            },
            label = { Text("Verification code") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("verification-code")
        )
        (validationError ?: errorMessage)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = {
                validationError = AccountInputValidator.verificationError(code)
                if (validationError == null) {
                    onVerify(code)
                    code = ""
                }
            },
            modifier = Modifier.fillMaxWidth().testTag("verification-submit")
        ) { Text("Verify") }
        Button(onClick = onResend, modifier = Modifier.fillMaxWidth()) { Text("Resend code") }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}

@Composable
fun SignInScreen(
    onSignIn: (String, String) -> Unit,
    onRegisterClick: () -> Unit,
    errorMessage: String?
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Sign in", style = MaterialTheme.typography.headlineMedium)
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("signin-email")
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("signin-password")
        )
        errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = {
            onSignIn(email, password)
            password = ""
        }, modifier = Modifier.fillMaxWidth().testTag("signin-submit")) { Text("Sign in") }
        Button(onClick = onRegisterClick, modifier = Modifier.fillMaxWidth()) { Text("Create an account") }
    }
}

@Composable
fun SearchScreen(
    ingredientsText: String,
    parsedIngredients: ParseResult,
    isReadyToSearch: Boolean,
    onIngredientsChange: (String) -> Unit,
    onParse: () -> Unit,
    onUpdateTerm: (String, String, String) -> Unit,
    onRemoveTerm: (String, String) -> Unit,
    onSearch: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenAccount: () -> Unit,
    onBack: () -> Unit,
    onClearSearch: () -> Unit,
    errorMessage: String?
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Search recipes", style = MaterialTheme.typography.headlineMedium)
        OutlinedTextField(
            value = ingredientsText,
            onValueChange = onIngredientsChange,
            label = { Text("Ingredients") },
            supportingText = { Text("Enter ingredients separated by commas.") },
            modifier = Modifier.fillMaxWidth()
        )
        Button(onClick = onParse, modifier = Modifier.fillMaxWidth()) { Text("Parse ingredients") }
        if (parsedIngredients.isNotEmpty) {
            Text("Review and edit criteria", style = MaterialTheme.typography.titleMedium)
            CriterionList("Included", parsedIngredients.included, onUpdateTerm, onRemoveTerm)
            CriterionList("Excluded", parsedIngredients.excluded, onUpdateTerm, onRemoveTerm)
            CriterionList("Excluded categories", parsedIngredients.excludedCategories, onUpdateTerm, onRemoveTerm)
            CriterionList(
                "Unrecognized — kept until removed or corrected",
                parsedIngredients.unrecognized,
                onUpdateTerm,
                onRemoveTerm
            )
        }
        errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (!isReadyToSearch) Text("Parse the current ingredient text before searching.")
        Button(
            onClick = onSearch,
            enabled = isReadyToSearch,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Search") }
        Button(onClick = onOpenFavorites, modifier = Modifier.fillMaxWidth()) { Text("Favorites") }
        Button(onClick = onOpenAccount, modifier = Modifier.fillMaxWidth()) { Text("Account") }
        Button(onClick = onClearSearch, modifier = Modifier.fillMaxWidth()) { Text("Clear") }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}

@Composable
private fun CriterionList(
    title: String,
    terms: List<String>,
    onUpdateTerm: (String, String, String) -> Unit,
    onRemoveTerm: (String, String) -> Unit
) {
    if (terms.isEmpty()) return
    Text(title, style = MaterialTheme.typography.labelLarge)
    terms.forEach { term ->
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = term,
                onValueChange = { onUpdateTerm(title, term, it) },
                label = { Text(title) },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            Button(
                onClick = { onRemoveTerm(title, term) },
                modifier = Modifier.semantics { contentDescription = "Remove $term" }
            ) { Text("Remove") }
        }
    }
}

@Composable
fun RecipeResultsScreen(
    recipes: List<RecipeSummary>,
    onRecipeClick: (RecipeSummary) -> Unit,
    onLoadMore: () -> Unit,
    onBack: () -> Unit,
    hasMore: Boolean,
    errorMessage: String?
) {
    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Results", style = MaterialTheme.typography.headlineMedium)
        errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (recipes.isEmpty()) {
            Text("No recipes matched these ingredients. Edit your criteria and try again.")
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(recipes, key = RecipeSummary::id) { recipe ->
                    Card(modifier = Modifier.fillMaxWidth().clickable { onRecipeClick(recipe) }) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(recipe.name, style = MaterialTheme.typography.titleMedium)
                            Text("Matched: ${recipe.matchedIngredients.ifEmpty { listOf("None") }.joinToString()}")
                            Text("Missing: ${recipe.missingIngredients.ifEmpty { listOf("None") }.joinToString()}")
                            Text("Cook time: ${recipe.minutes?.let { "$it min" } ?: "Unavailable"}")
                        }
                    }
                }
            }
        }
        if (hasMore) {
            Button(onClick = onLoadMore, modifier = Modifier.fillMaxWidth()) { Text("Load more") }
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}

@Composable
fun RecipeDetailScreen(
    recipe: RecipeDetail?,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    isFavorite: Boolean,
    myRating: Int?,
    onToggleFavorite: () -> Unit,
    onRateRecipe: (Int) -> Unit,
    onClearRating: () -> Unit,
    errorMessage: String?
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (recipe != null) {
            Text(recipe.name, style = MaterialTheme.typography.headlineMedium)
            Text("Cook time: ${recipe.minutes?.let { "$it min" } ?: "Unavailable"}")
            Text("Cuisines: ${recipe.cuisines.ifEmpty { listOf("Unavailable") }.joinToString()}")
            Text("Ingredients", style = MaterialTheme.typography.titleMedium)
            if (recipe.ingredients.isEmpty()) Text("Ingredients unavailable.")
            recipe.ingredients.forEach { Text("• $it") }
            Text("Instructions", style = MaterialTheme.typography.titleMedium)
            if (recipe.instructions.isNullOrEmpty()) {
                Text("Cooking instructions unavailable.")
            } else {
                recipe.instructions.forEachIndexed { index, step -> Text("${index + 1}. $step") }
            }
            val ratingValues = if (recipe.ratings.isEmpty()) "Unavailable" else recipe.ratings.joinToString()
            val average = recipe.ratingAggregate?.let { "%.1f".format(it) } ?: "unavailable"
            Text("Anonymous ratings: $ratingValues (average $average)")
            Button(onClick = onToggleFavorite, modifier = Modifier.fillMaxWidth().testTag("favorite-toggle")) {
                Text(if (isFavorite) "Remove from favorites" else "Add to favorites")
            }
            Text(myRating?.let { "Your rating: $it of 5" } ?: "You have not rated this recipe.")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..5).forEach { value ->
                    Button(
                        onClick = { onRateRecipe(value) },
                        modifier = Modifier.testTag("rate-$value")
                    ) { Text(if (myRating == value) "✓$value" else "$value") }
                }
            }
            if (myRating != null) {
                Button(onClick = onClearRating, modifier = Modifier.fillMaxWidth()) { Text("Remove my rating") }
            }
        }
        errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (recipe == null && errorMessage != null) {
            Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) { Text("Retry") }
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}

@Composable
fun FavoritesScreen(
    favorites: List<FavoriteRecipe>,
    isLoaded: Boolean,
    onOpen: (FavoriteRecipe) -> Unit,
    onRemove: (FavoriteRecipe) -> Unit,
    onBack: () -> Unit,
    errorMessage: String?
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Favorites", style = MaterialTheme.typography.headlineMedium)
        errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (isLoaded && favorites.isEmpty()) Text("You have no favorites yet.")
        favorites.forEach { recipe ->
            Card(modifier = Modifier.fillMaxWidth().clickable { onOpen(recipe) }) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(recipe.name, style = MaterialTheme.typography.titleMedium)
                    Text("Cook time: ${recipe.minutes?.let { "$it min" } ?: "Unavailable"}")
                    if (recipe.ingredientNames.isNotEmpty()) Text(recipe.ingredientNames.joinToString())
                    Button(onClick = { onRemove(recipe) }) { Text("Remove") }
                }
            }
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}

@Composable
fun AccountScreen(
    email: String,
    username: String,
    themeMode: ThemeMode,
    onThemeChanged: (ThemeMode) -> Unit,
    onSignOut: () -> Unit,
    onDeleteAccount: () -> Unit,
    onBack: () -> Unit,
    errorMessage: String?
) {
    var selected by remember { mutableStateOf(themeMode) }
    var confirmDelete by remember { mutableStateOf(false) }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete account?") },
            text = { Text("This permanently deletes your account, favorites and ratings. It cannot be undone.") },
            confirmButton = {
                Button(
                    onClick = {
                        confirmDelete = false
                        onDeleteAccount()
                    },
                    modifier = Modifier.testTag("delete-confirm")
                ) { Text("Delete permanently") }
            },
            dismissButton = { Button(onClick = { confirmDelete = false }) { Text("Cancel") } }
        )
    }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Account", style = MaterialTheme.typography.headlineMedium)
        Text("Email: $email")
        Text("Username: $username")
        Text("Theme preference")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(ThemeMode.Light, ThemeMode.Dark, ThemeMode.System).forEach { option ->
                Button(onClick = {
                    selected = option
                    onThemeChanged(option)
                }) {
                    Text(if (selected == option) "✓ ${option.name}" else option.name)
                }
            }
        }
        errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) { Text("Sign out") }
        Button(onClick = { confirmDelete = true }, modifier = Modifier.fillMaxWidth().testTag("delete-account")) { Text("Delete account") }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}

private val ParseResult.isNotEmpty: Boolean
    get() = included.isNotEmpty() || excluded.isNotEmpty() ||
        excludedCategories.isNotEmpty() || unrecognized.isNotEmpty()
