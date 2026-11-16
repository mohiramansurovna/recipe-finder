package com.recipegraph.android.data

object AccountInputValidator {
    fun registrationError(email: String, username: String, password: String): String? = when {
        !email.trim().matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) -> "Enter a valid email address."
        !username.matches(Regex("^[A-Za-z0-9_]{3,30}$")) ->
            "Username must contain 3–30 letters, numbers, or underscores."
        password.length < 12 -> "Password must be at least 12 characters."
        else -> null
    }

    fun verificationError(code: String): String? =
        if (code.matches(Regex("^\\d{8}$"))) null else "Enter the eight-digit verification code."
}
