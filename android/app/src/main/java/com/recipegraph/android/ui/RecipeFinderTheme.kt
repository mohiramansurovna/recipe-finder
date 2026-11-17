package com.recipegraph.android.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

/** Design tokens from the Figma "Recipe Finder" file (qP5DLZjjPHBKhMvWG57O06). */
@Immutable
class RfColors(
    val isDark: Boolean,
    val surface: Color,
    val text: Color,
    val muted: Color,
    val primary: Color,
    val onPrimary: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
    val accent: Color,
    val accentContainer: Color,
    val card: Color,
    val outline: Color,
    val outlineControl: Color,
    val error: Color,
    val onError: Color
)

val RfLightColors = RfColors(
    isDark = false,
    surface = Color(0xFFFFF8F0),
    text = Color(0xFF2B1B12),
    muted = Color(0xFF776151),
    primary = Color(0xFF214F3B),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCEBDC),
    onPrimaryContainer = Color(0xFF173D29),
    accent = Color(0xFF92502B),
    accentContainer = Color(0xFFFFF0DF),
    card = Color.White,
    outline = Color(0xFFE5D7C9),
    outlineControl = Color(0xFF7A7366),
    error = Color(0xFFC92A2A),
    onError = Color.White
)

// outlineControl and error are not shown in the dark Figma frames; these values are assumptions.
val RfDarkColors = RfColors(
    isDark = true,
    surface = Color(0xFF1E1612),
    text = Color(0xFFFFF4E8),
    muted = Color(0xFFCFBBAA),
    primary = Color(0xFFA6D4B4),
    onPrimary = Color(0xFF103824),
    primaryContainer = Color(0xFF294C37),
    onPrimaryContainer = Color(0xFFC4EDCB),
    accent = Color(0xFFF6CDA3),
    accentContainer = Color(0xFF442A1B),
    card = Color(0xFF2B211B),
    outline = Color(0xFF594334),
    outlineControl = Color(0xFF8F7B6A),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005)
)

val LocalRfColors = staticCompositionLocalOf { RfLightColors }

object Rf {
    val colors: RfColors
        @Composable @ReadOnlyComposable get() = LocalRfColors.current
}

object RfShapes {
    val small = RoundedCornerShape(12.dp)
    val medium = RoundedCornerShape(16.dp)
    val pill = RoundedCornerShape(100.dp)
}

object RfType {
    val display = TextStyle(fontSize = 40.sp, lineHeight = 44.sp, fontWeight = FontWeight.Normal, letterSpacing = 0.sp)
    val headline = TextStyle(fontSize = 32.sp, lineHeight = 38.sp, fontWeight = FontWeight.Normal, letterSpacing = 0.sp)
    val title = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.sp)
    val section = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.sp)
    val body = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.Normal, letterSpacing = 0.sp)
    val bodySmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Normal, letterSpacing = 0.sp)
    val label = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.sp)
    val caption = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.sp)
}

@Composable
fun RecipeFinderTheme(themeMode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (themeMode) {
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
        ThemeMode.System -> isSystemInDarkTheme()
    }
    val c = if (dark) RfDarkColors else RfLightColors
    val scheme = if (dark) {
        darkColorScheme(
            primary = c.primary, onPrimary = c.onPrimary,
            primaryContainer = c.primaryContainer, onPrimaryContainer = c.onPrimaryContainer,
            secondary = c.accent, secondaryContainer = c.accentContainer,
            background = c.surface, onBackground = c.text,
            surface = c.surface, onSurface = c.text,
            surfaceVariant = c.card, onSurfaceVariant = c.muted,
            outline = c.outlineControl, outlineVariant = c.outline,
            error = c.error, onError = c.onError
        )
    } else {
        lightColorScheme(
            primary = c.primary, onPrimary = c.onPrimary,
            primaryContainer = c.primaryContainer, onPrimaryContainer = c.onPrimaryContainer,
            secondary = c.accent, secondaryContainer = c.accentContainer,
            background = c.surface, onBackground = c.text,
            surface = c.surface, onSurface = c.text,
            surfaceVariant = c.card, onSurfaceVariant = c.muted,
            outline = c.outlineControl, outlineVariant = c.outline,
            error = c.error, onError = c.onError
        )
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = view.context.findActivity()?.window ?: return@SideEffect
            window.statusBarColor = c.surface.toArgb()
            window.navigationBarColor = c.surface.toArgb()
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
        }
    }

    MaterialTheme(colorScheme = scheme) {
        CompositionLocalProvider(LocalRfColors provides c, LocalContentColor provides c.text, content = content)
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
