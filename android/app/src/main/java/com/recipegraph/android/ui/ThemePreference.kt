package com.recipegraph.android.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

enum class ThemeMode {
    Light,
    Dark,
    System
}

class ThemePreferenceStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("recipe_graph_theme", Context.MODE_PRIVATE)

    var themeMode: ThemeMode by mutableStateOf(loadTheme())
        private set

    fun setTheme(themeMode: ThemeMode) {
        this.themeMode = themeMode
        prefs.edit().putString("theme_mode", themeMode.name).apply()
    }

    private fun loadTheme(): ThemeMode {
        val saved = prefs.getString("theme_mode", ThemeMode.System.name) ?: ThemeMode.System.name
        return ThemeMode.valueOf(saved)
    }
}
