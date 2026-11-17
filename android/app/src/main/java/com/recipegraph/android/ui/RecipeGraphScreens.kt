package com.recipegraph.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.recipegraph.android.R
import com.recipegraph.android.data.AccountInputValidator
import com.recipegraph.android.data.FavoriteRecipe
import com.recipegraph.android.data.ParseResult
import com.recipegraph.android.data.RecipeDetail
import com.recipegraph.android.data.RecipeSummary

private const val DEMO_FOOTER = "INTERNAL DEMO · SAMPLE DATA ONLY"

// Section titles are the keys ParseResult.updateTerm / removeTerm expect.
private const val SECTION_INCLUDED = "Included"
private const val SECTION_EXCLUDED = "Excluded"
private const val SECTION_CATEGORIES = "Excluded categories"
private const val SECTION_UNRECOGNIZED = "Unrecognized — kept until removed or corrected"

private fun minutesLabel(minutes: Int?) = minutes?.let { "$it min" } ?: "Cook time unavailable"

@Composable
fun WelcomeScreen(
    onRegisterClick: () -> Unit,
    onSignInClick: () -> Unit,
    errorMessage: String?
) {
    val c = Rf.colors
    RfScreen("Recipe Finder") {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(176.dp)
                .clip(RfShapes.medium)
                .background(c.primaryContainer),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(painterResource(R.drawable.ic_pot), contentDescription = null, modifier = Modifier.size(72.dp), tint = c.primary)
                Text("GOOD FOOD STARTS AT HOME", style = RfType.caption, color = c.onPrimaryContainer)
            }
        }
        Text("A good meal.\nAlready in reach.", style = RfType.display, color = c.text, modifier = Modifier.fillMaxWidth())
        RfBody("Turn the ingredients you have into something you’ll love to cook.")
        errorMessage?.let { RfNotice(it) }
        RfButton("Create account", onRegisterClick, Modifier.testTag("welcome-register"))
        RfButton("Sign in", onSignInClick, Modifier.testTag("welcome-signin"), style = RfButtonStyle.Tonal)
        RfCaption(DEMO_FOOTER, center = true)
    }
}

@Composable
fun RegisterScreen(
    onRegister: (String, String, String) -> Unit,
    onBack: () -> Unit,
    onSignInClick: () -> Unit,
    errorMessage: String?
) {
    var email by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    RfScreen("Create account", onBack = onBack) {
        RfEyebrow("YOUR DEMO KITCHEN")
        RfHeadline("Let’s get cooking.")
        RfBody("Create a test account to save recipes.")
        RfNotice("Use a disposable test account and inbox. Don't enter personal information.")
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            RfTextField(
                label = "Email",
                value = email,
                onValueChange = { email = it; validationError = null },
                modifier = Modifier.testTag("register-email"),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
            )
            RfTextField(
                label = "Username",
                value = username,
                onValueChange = { username = it; validationError = null },
                modifier = Modifier.testTag("register-username"),
                help = "3–30 letters, numbers, or underscores"
            )
            RfTextField(
                label = "Password",
                value = password,
                onValueChange = { password = it; validationError = null },
                modifier = Modifier.testTag("register-password"),
                help = "Use a unique test-only password.",
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
            )
        }
        (validationError ?: errorMessage)?.let { RfNotice(it) }
        RfButton(
            "Create account",
            onClick = {
                validationError = AccountInputValidator.registrationError(email, username, password)
                if (validationError == null) {
                    onRegister(email, username, password)
                    password = ""
                }
            },
            modifier = Modifier.testTag("register-submit")
        )
        RfButton("Already have an account? Sign in", onSignInClick, style = RfButtonStyle.Text)
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

    RfScreen("Verify email", onBack = onBack) {
        RfEyebrow("ONE LAST STEP")
        RfHeadline("Check your inbox.")
        RfBody("Enter the 8-digit code sent to $email.")
        RfTextField(
            label = "8-digit verification code",
            value = code,
            onValueChange = { input ->
                code = input.filter(Char::isDigit).take(8)
                validationError = null
            },
            modifier = Modifier.testTag("verification-code"),
            help = "Use the latest code from your test inbox.",
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
        (validationError ?: errorMessage)?.let { RfNotice(it) }
        RfButton(
            "Verify email",
            onClick = {
                validationError = AccountInputValidator.verificationError(code)
                if (validationError == null) {
                    onVerify(code)
                    code = ""
                }
            },
            modifier = Modifier.testTag("verification-submit")
        )
        RfButton("Resend code", onResend, style = RfButtonStyle.Text)
        RfBodySmall("A new code replaces any previous code.")
    }
}

@Composable
fun SignInScreen(
    onSignIn: (String, String) -> Unit,
    onRegisterClick: () -> Unit,
    onBack: (() -> Unit)?,
    errorMessage: String?
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    RfScreen("Sign in", onBack = onBack) {
        RfEyebrow("WELCOME BACK")
        RfHeadline("Your next meal awaits.")
        RfBody("Sign in with your disposable demo account.")
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            RfTextField(
                label = "Email",
                value = email,
                onValueChange = { email = it },
                modifier = Modifier.testTag("signin-email"),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
            )
            RfTextField(
                label = "Password",
                value = password,
                onValueChange = { password = it },
                modifier = Modifier.testTag("signin-password"),
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
            )
        }
        errorMessage?.let { RfNotice(it) }
        RfButton(
            "Sign in",
            onClick = {
                onSignIn(email, password)
                password = ""
            },
            modifier = Modifier.testTag("signin-submit")
        )
        RfButton("Create a test account", onRegisterClick, style = RfButtonStyle.Text)
        RfBodySmall("Use test-only credentials. Never enter a personal password.")
    }
}

private data class ChipEdit(val section: String, val term: String)

@OptIn(ExperimentalLayoutApi::class)
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
    onNavigate: (RfTab) -> Unit,
    onClearSearch: () -> Unit,
    errorMessage: String?
) {
    var editing by remember { mutableStateOf<ChipEdit?>(null) }
    editing?.let { edit ->
        EditTermDialog(
            term = edit.term,
            onDismiss = { editing = null },
            onSave = { newTerm ->
                if (newTerm.isNotBlank() && newTerm != edit.term) onUpdateTerm(edit.section, edit.term, newTerm.trim())
                editing = null
            }
        )
    }

    RfScreen("Recipe Finder", activeTab = RfTab.Search, onNavigate = onNavigate) {
        RfEyebrow("FROM YOUR PANTRY")
        RfHeadline("What’s in\nyour kitchen?")
        RfBody("A few ingredients. Plenty of possibilities.")
        RfTextField(
            label = "Ingredients on hand",
            value = ingredientsText,
            onValueChange = onIngredientsChange,
            modifier = Modifier.testTag("ingredients-input"),
            help = "Separate with commas or new lines.",
            singleLine = false,
            minLines = 3
        )
        RfButton("Parse ingredients", onParse, style = RfButtonStyle.Tonal, enabled = ingredientsText.isNotBlank())

        if (parsedIngredients.hasTerms) {
            RfCaption("YOUR INGREDIENTS · TAP TO EDIT")
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val chipActions = ChipActions(
                    onEdit = { section, term -> editing = ChipEdit(section, term) },
                    onRemove = onRemoveTerm
                )
                CriterionChips(SECTION_INCLUDED, parsedIngredients.included, RfChipKind.Recognized, chipActions) { it }
                CriterionChips(SECTION_EXCLUDED, parsedIngredients.excluded, RfChipKind.Excluded, chipActions) { "Without $it" }
                CriterionChips(SECTION_CATEGORIES, parsedIngredients.excludedCategories, RfChipKind.Excluded, chipActions) { "No $it" }
                CriterionChips(SECTION_UNRECOGNIZED, parsedIngredients.unrecognized, RfChipKind.Unrecognized, chipActions) { "? $it" }
            }
            if (parsedIngredients.unrecognized.isNotEmpty()) {
                RfNotice(unrecognizedNotice(parsedIngredients))
            }
        }
        errorMessage?.let { RfNotice(it) }
        if (!isReadyToSearch && ingredientsText.isNotBlank()) {
            RfBodySmall("Parse your ingredients before searching.")
        }
        RfButton("Search recipes", onSearch, enabled = isReadyToSearch)
        if (ingredientsText.isNotBlank() || parsedIngredients.hasTerms) {
            RfButton("Clear search", onClearSearch, style = RfButtonStyle.Text)
        }
        RfCaption("INTERNAL DEMO · SAMPLE DATA", center = true)
    }
}

private class ChipActions(val onEdit: (String, String) -> Unit, val onRemove: (String, String) -> Unit)

@Composable
private fun CriterionChips(
    section: String,
    terms: List<String>,
    kind: RfChipKind,
    actions: ChipActions,
    text: (String) -> String
) {
    terms.forEach { term ->
        RfChip(
            label = text(term),
            kind = kind,
            onEdit = { actions.onEdit(section, term) },
            onRemove = { actions.onRemove(section, term) },
            removeDescription = "Remove $term"
        )
    }
}

private fun unrecognizedNotice(parsed: ParseResult): String {
    val names = parsed.unrecognized.joinToString(", ") { "“$it”" }
    val single = parsed.unrecognized.size == 1
    val subject = if (single) "$names isn’t recognized." else "$names aren’t recognized."
    val pronoun = if (single) "it" else "them"
    val searched = parsed.included.size
    return if (searched > 0) {
        "$subject Edit or remove $pronoun, or search with the other $searched ingredient${if (searched == 1) "" else "s"}."
    } else {
        "$subject Edit or remove $pronoun to search."
    }
}

@Composable
private fun EditTermDialog(term: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    val c = Rf.colors
    var value by remember { mutableStateOf(term) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = c.card,
        titleContentColor = c.text,
        textContentColor = c.text,
        title = { Text("Edit ingredient", style = RfType.title) },
        text = { RfTextField(label = "Ingredient", value = value, onValueChange = { value = it }, modifier = Modifier.testTag("edit-term")) },
        confirmButton = { TextButton(onClick = { onSave(value) }) { Text("Save", style = RfType.label, color = c.primary) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", style = RfType.label, color = c.primary) } }
    )
}

@Composable
fun RecipeResultsScreen(
    recipes: List<RecipeSummary>,
    criteriaSummary: String,
    unrecognized: List<String>,
    onRecipeClick: (RecipeSummary) -> Unit,
    onLoadMore: () -> Unit,
    onBack: () -> Unit,
    onNavigate: (RfTab) -> Unit,
    hasMore: Boolean,
    errorMessage: String?
) {
    RfScreen("Recipes for you", onBack = onBack, activeTab = RfTab.Search, onNavigate = onNavigate) {
        RfHeadline("A little pantry magic.")
        if (criteriaSummary.isNotBlank()) RfBody(criteriaSummary)
        if (unrecognized.isNotEmpty()) {
            RfNotice("Not matched: ${unrecognized.joinToString(", ") { "“$it”" }}. Your term is kept.")
        }
        errorMessage?.let { RfNotice(it) }
        if (recipes.isEmpty()) {
            RfBody("No recipes matched these ingredients. Edit your criteria and try again.")
        } else {
            val count = "${recipes.size}${if (hasMore) "+" else ""}"
            RfCaption("$count ${if (recipes.size == 1 && !hasMore) "RECIPE" else "RECIPES"} · SAMPLE RESULTS")
            recipes.forEach { recipe ->
                val total = recipe.matchedIngredients.size + recipe.missingIngredients.size
                RfRecipeCard(
                    name = recipe.name,
                    meta = minutesLabel(recipe.minutes),
                    fit = if (total > 0) "${recipe.matchedIngredients.size} of $total ingredients on hand" else null,
                    onClick = { onRecipeClick(recipe) }
                )
            }
        }
        if (hasMore) RfButton("Load more", onLoadMore, style = RfButtonStyle.Tonal)
        RfButton("Edit ingredients", onBack, style = RfButtonStyle.Text)
    }
}

@Composable
fun RecipeDetailScreen(
    recipe: RecipeDetail?,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onNavigate: (RfTab) -> Unit,
    isFavorite: Boolean,
    myRating: Int?,
    onToggleFavorite: () -> Unit,
    onRateRecipe: (Int) -> Unit,
    onClearRating: () -> Unit,
    errorMessage: String?
) {
    val c = Rf.colors
    var rating by rememberSaveable { mutableStateOf(false) }
    BackHandler(enabled = rating) { rating = false }

    if (rating && recipe != null) {
        RateRecipeScreen(
            recipeName = recipe.name,
            myRating = myRating,
            onSubmit = { value ->
                onRateRecipe(value)
                rating = false
            },
            onClear = {
                onClearRating()
                rating = false
            },
            onClose = { rating = false },
            onNavigate = onNavigate,
            errorMessage = errorMessage
        )
        return
    }

    RfScreen("Recipe details", onBack = onBack, activeTab = RfTab.Search, onNavigate = onNavigate) {
        if (recipe != null) {
            RfEyebrow("SIMPLE PANTRY COOKING")
            RfHeadline(recipe.name)
            RfBody(
                listOfNotNull(recipe.minutes?.let { "$it min" }, recipe.cuisines.takeIf { it.isNotEmpty() }?.joinToString(", "))
                    .joinToString(" · ").ifEmpty { "Cook time unavailable" }
            )
            val count = recipe.ratings.size
            Text(
                if (count == 0 || recipe.ratingAggregate == null) {
                    "No ratings yet"
                } else {
                    "★ ${"%.1f".format(recipe.ratingAggregate)} · $count anonymous rating${if (count == 1) "" else "s"}"
                },
                style = RfType.label,
                color = c.accent,
                modifier = Modifier.fillMaxWidth()
            )
            RfButton(
                if (isFavorite) "♥ Saved · Remove" else "♡ Save recipe",
                onToggleFavorite,
                Modifier.testTag("favorite-toggle"),
                style = if (isFavorite) RfButtonStyle.Tonal else RfButtonStyle.Filled
            )
            RfCard(container = c.primaryContainer) {
                Text("Before you start", style = RfType.label, color = c.onPrimaryContainer)
                Text("Check the ingredients below for what you have.", style = RfType.bodySmall, color = c.onPrimaryContainer)
            }

            RfSectionTitle("Ingredients")
            RfCard {
                if (recipe.ingredients.isEmpty()) {
                    RfBody("Ingredients unavailable.")
                } else {
                    recipe.ingredients.forEach { RfBody("• $it", color = c.text) }
                }
            }

            RfSectionTitle("Let’s make it")
            if (recipe.instructions.isNullOrEmpty()) {
                RfCard { RfBody("Cooking instructions unavailable.") }
            } else {
                recipe.instructions.forEachIndexed { index, step ->
                    RfCard(bordered = true, spacing = 4.dp) {
                        Text("%02d".format(index + 1), style = RfType.caption, color = c.accent)
                        Text(step, style = RfType.body, color = c.text)
                    }
                }
            }

            RfCard(container = c.primaryContainer) {
                Text("Made it? Rate it.", style = RfType.title, color = c.onPrimaryContainer)
                Text(
                    myRating?.let { "Your rating: $it of 5. You can update it any time." }
                        ?: "Ratings are anonymous. Choose 1–5 stars; you can update your rating.",
                    style = RfType.bodySmall,
                    color = c.onPrimaryContainer
                )
                RfButton(if (myRating == null) "Rate this recipe" else "Update my rating", { rating = true }, Modifier.padding(top = 8.dp))
            }
        } else if (errorMessage == null) {
            RfBody("Loading recipe…")
        }
        errorMessage?.let { RfNotice(it) }
        if (recipe == null && errorMessage != null) {
            RfButton("Retry", onRetry, style = RfButtonStyle.Tonal)
        }
        RfCaption("SAMPLE RECIPE · INTERNAL DEMO", center = true)
    }
}

@Composable
private fun RateRecipeScreen(
    recipeName: String,
    myRating: Int?,
    onSubmit: (Int) -> Unit,
    onClear: () -> Unit,
    onClose: () -> Unit,
    onNavigate: (RfTab) -> Unit,
    errorMessage: String?
) {
    val c = Rf.colors
    var selected by remember { mutableStateOf(myRating ?: 0) }
    RfScreen("Rate recipe", onBack = onClose, activeTab = RfTab.Search, onNavigate = onNavigate) {
        RfEyebrow("COOKED IT?")
        RfHeadline("How did it turn out?")
        RfBody(recipeName)
        RfCard(spacing = 8.dp) {
            Text("Choose 1–5 stars", style = RfType.title, color = c.primary)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (1..5).forEach { value ->
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .testTag("rate-$value")
                            .semantics { contentDescription = "$value ${if (value == 1) "star" else "stars"}" }
                            .selectable(selected = selected == value, role = Role.RadioButton, onClick = { selected = value }),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(if (value <= selected) "★" else "☆", fontSize = 32.sp, color = c.accent)
                    }
                }
            }
            Text(
                if (selected == 0) "Tap a star to choose" else "$selected of 5 stars selected",
                style = RfType.label,
                color = c.primary
            )
            Text("Ratings are anonymous. No name or profile is shared with your rating.", style = RfType.bodySmall, color = c.muted)
        }
        errorMessage?.let { RfNotice(it) }
        RfButton("Submit rating", { onSubmit(selected) }, enabled = selected > 0)
        if (myRating != null) RfButton("Remove my rating", onClear, style = RfButtonStyle.Tonal)
        RfButton("Back to recipe", onClose, style = RfButtonStyle.Text)
    }
}

@Composable
fun FavoritesScreen(
    favorites: List<FavoriteRecipe>,
    isLoaded: Boolean,
    onOpen: (FavoriteRecipe) -> Unit,
    onRemove: (FavoriteRecipe) -> Unit,
    onNavigate: (RfTab) -> Unit,
    errorMessage: String?
) {
    RfScreen("Favorites", activeTab = RfTab.Favorites, onNavigate = onNavigate) {
        RfEyebrow("KEEP THE GOOD ONES")
        RfHeadline("Worth cooking again.")
        RfBody("Your saved recipes, all in one place.")
        errorMessage?.let { RfNotice(it) }
        if (isLoaded && favorites.isEmpty()) RfBody("You have no favorites yet.")
        favorites.forEach { recipe ->
            RfRecipeCard(
                name = recipe.name,
                meta = minutesLabel(recipe.minutes),
                fit = recipe.ingredientNames.size.takeIf { it > 0 }?.let { "$it ingredient${if (it == 1) "" else "s"}" },
                onClick = { onOpen(recipe) },
                extra = { RfTextAction("Remove", { onRemove(recipe) }, "Remove ${recipe.name} from favorites") }
            )
        }
        RfButton("Find more recipes", { onNavigate(RfTab.Search) }, style = RfButtonStyle.Tonal)
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
    onNavigate: (RfTab) -> Unit,
    errorMessage: String?
) {
    val c = Rf.colors
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    var themeOpen by rememberSaveable { mutableStateOf(false) }
    BackHandler(enabled = confirmDelete) { confirmDelete = false }

    if (confirmDelete) {
        RfScreen("Account", onBack = { confirmDelete = false }, activeTab = RfTab.Account, onNavigate = onNavigate) {
            RfHeadline("A moment to confirm.")
            RfCard(spacing = 8.dp) {
                Text("Delete your account?", style = RfType.title, color = c.text)
                RfBody("Your account data and favorites will be deleted. Retained ratings will no longer identify you. This cannot be undone.")
                RfButton(
                    "Delete account",
                    {
                        confirmDelete = false
                        onDeleteAccount()
                    },
                    Modifier.testTag("delete-confirm"),
                    style = RfButtonStyle.Error
                )
                RfButton("Cancel", { confirmDelete = false }, style = RfButtonStyle.Text)
            }
            RfBodySmall("This is separate from logging out.")
        }
        return
    }

    RfScreen("Account", activeTab = RfTab.Account, onNavigate = onNavigate) {
        RfEyebrow("YOUR DEMO KITCHEN")
        RfHeadline("Hello, $username.")
        RfCard {
            RfCaption("ACCOUNT DETAILS · READ ONLY")
            Text("Email", style = RfType.caption, color = c.muted)
            Text(email, style = RfType.body, color = c.text)
            Text("Username", style = RfType.caption, color = c.muted, modifier = Modifier.padding(top = 4.dp))
            Text(username, style = RfType.body, color = c.text)
        }
        RfCard(container = c.primaryContainer, onClick = { themeOpen = !themeOpen }) {
            Text("Make yourself at home.", style = RfType.title, color = c.onPrimaryContainer)
            Text("Theme", style = RfType.label, color = c.onPrimaryContainer)
            Text(themeLabel(themeMode), style = RfType.body, color = c.onPrimaryContainer)
            Text("Light, dark or follow your device ›", style = RfType.bodySmall, color = c.onPrimaryContainer)
            if (themeOpen) {
                listOf(ThemeMode.Light, ThemeMode.Dark, ThemeMode.System).forEach { option ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .selectable(selected = themeMode == option, role = Role.RadioButton, onClick = { onThemeChanged(option) }),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = themeMode == option,
                            onClick = null,
                            colors = RadioButtonDefaults.colors(selectedColor = c.primary, unselectedColor = c.onPrimaryContainer)
                        )
                        Text(themeLabel(option), style = RfType.body, color = c.onPrimaryContainer, modifier = Modifier.padding(start = 12.dp))
                    }
                }
            }
        }
        errorMessage?.let { RfNotice(it) }
        RfButton("Log out", onSignOut, style = RfButtonStyle.Tonal)
        RfBodySmall("Clears this device’s session and local data.")
        RfButton("Delete account", { confirmDelete = true }, Modifier.testTag("delete-account"), style = RfButtonStyle.Text)
        RfCaption(DEMO_FOOTER, center = true)
    }
}

private fun themeLabel(mode: ThemeMode) = when (mode) {
    ThemeMode.Light -> "Light"
    ThemeMode.Dark -> "Dark"
    ThemeMode.System -> "Follow device"
}

private val ParseResult.hasTerms: Boolean
    get() = included.isNotEmpty() || excluded.isNotEmpty() ||
        excludedCategories.isNotEmpty() || unrecognized.isNotEmpty()
