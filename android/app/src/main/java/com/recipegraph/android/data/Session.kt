package com.recipegraph.android.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Access and refresh tokens for one device session. Never log or display these values. */
data class SessionTokens(
    val sessionId: String,
    val accessToken: String,
    val refreshToken: String
) {
    // Keep tokens out of accidental logs and crash reports.
    override fun toString(): String = "SessionTokens(sessionId=$sessionId)"
}

interface TokenStore {
    fun load(): SessionTokens?
    fun save(tokens: SessionTokens)
    fun clear()
}

class InMemoryTokenStore(initial: SessionTokens? = null) : TokenStore {
    private var tokens: SessionTokens? = initial
    override fun load(): SessionTokens? = tokens
    override fun save(tokens: SessionTokens) {
        this.tokens = tokens
    }

    override fun clear() {
        tokens = null
    }
}

/**
 * Stores tokens encrypted with an Android Keystore AES-GCM key. The key never leaves the
 * Keystore, and unreadable or tampered data is discarded so the person simply signs in again.
 */
class KeystoreTokenStore(context: Context) : TokenStore {
    private val prefs = context.applicationContext
        .getSharedPreferences("recipe_graph_session", Context.MODE_PRIVATE)

    override fun load(): SessionTokens? {
        val blob = prefs.getString(PREF_KEY, null) ?: return null
        return try {
            val raw = Base64.decode(blob, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, raw.copyOfRange(0, IV_BYTES)))
            val json = JSONObject(String(cipher.doFinal(raw, IV_BYTES, raw.size - IV_BYTES), Charsets.UTF_8))
            SessionTokens(
                sessionId = json.getString("sessionId"),
                accessToken = json.getString("accessToken"),
                refreshToken = json.getString("refreshToken")
            )
        } catch (_: Exception) {
            clear()
            null
        }
    }

    override fun save(tokens: SessionTokens) {
        val plain = JSONObject()
            .put("sessionId", tokens.sessionId)
            .put("accessToken", tokens.accessToken)
            .put("refreshToken", tokens.refreshToken)
            .toString()
            .toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.iv + cipher.doFinal(plain)
        prefs.edit().putString(PREF_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
    }

    override fun clear() {
        prefs.edit().remove(PREF_KEY).apply()
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private companion object {
        const val PREF_KEY = "tokens"
        const val KEY_ALIAS = "recipe_graph_session_key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
