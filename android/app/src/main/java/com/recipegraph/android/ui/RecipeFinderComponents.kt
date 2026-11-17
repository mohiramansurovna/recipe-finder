package com.recipegraph.android.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.Role
import com.recipegraph.android.R

enum class RfTab(val label: String, val icon: Int) {
    Search("Search", R.drawable.ic_search),
    Favorites("Favorites", R.drawable.ic_heart),
    Account("Account", R.drawable.ic_account)
}

/** Top app bar + padded scroll body (+ optional bottom navigation), matching the Figma screen frame. */
@Composable
fun RfScreen(
    title: String,
    onBack: (() -> Unit)? = null,
    activeTab: RfTab? = null,
    onNavigate: (RfTab) -> Unit = {},
    scrollState: ScrollState = rememberScrollState(),
    content: @Composable ColumnScope.() -> Unit
) {
    Column(Modifier.fillMaxSize()) {
        RfTopBar(title, onBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(scrollState)
                .padding(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            content = content
        )
        if (activeTab != null) RfBottomNav(activeTab, onNavigate)
    }
}

@Composable
private fun RfTopBar(title: String, onBack: (() -> Unit)?) {
    val c = Rf.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(start = if (onBack != null) 12.dp else 24.dp, end = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (onBack != null) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable(onClickLabel = "Back", role = Role.Button, onClick = onBack),
                contentAlignment = Alignment.Center
            ) {
                Icon(painterResource(R.drawable.ic_back), contentDescription = "Back", tint = c.primary)
            }
        }
        Text(
            title,
            style = RfType.section,
            color = c.primary,
            modifier = Modifier.weight(1f).semantics { heading() }
        )
    }
}

@Composable
fun RfBottomNav(active: RfTab, onSelect: (RfTab) -> Unit) {
    val c = Rf.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(80.dp)
            .shadow(3.dp, ambientColor = Color(0x1A2E1F24), spotColor = Color(0x1A2E1F24))
            .background(c.primaryContainer)
    ) {
        RfTab.values().forEach { tab ->
            val selected = tab == active
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .selectable(selected = selected, role = Role.Tab, onClick = { onSelect(tab) })
                    .padding(top = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 64.dp, height = 32.dp)
                        .clip(RfShapes.pill)
                        .background(if (selected) c.card else Color.Transparent),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painterResource(tab.icon),
                        contentDescription = null,
                        tint = if (selected) c.primary else c.muted
                    )
                }
                Text(tab.label, style = RfType.label, color = if (selected) c.primary else c.muted)
            }
        }
    }
}

@Composable
fun RfEyebrow(text: String) =
    Text(text, style = RfType.caption, color = Rf.colors.accent, modifier = Modifier.fillMaxWidth())

@Composable
fun RfHeadline(text: String) = Text(
    text,
    style = RfType.headline,
    color = Rf.colors.text,
    modifier = Modifier.fillMaxWidth().semantics { heading() }
)

@Composable
fun RfSectionTitle(text: String, color: Color = Rf.colors.text) = Text(
    text,
    style = RfType.title,
    color = color,
    modifier = Modifier.fillMaxWidth().semantics { heading() }
)

@Composable
fun RfBody(text: String, color: Color = Rf.colors.muted) =
    Text(text, style = RfType.body, color = color, modifier = Modifier.fillMaxWidth())

@Composable
fun RfBodySmall(text: String, color: Color = Rf.colors.muted) =
    Text(text, style = RfType.bodySmall, color = color, modifier = Modifier.fillMaxWidth())

@Composable
fun RfCaption(text: String, color: Color = Rf.colors.muted, center: Boolean = false) = Text(
    text,
    style = RfType.caption,
    color = color,
    textAlign = if (center) TextAlign.Center else TextAlign.Start,
    modifier = Modifier.fillMaxWidth()
)

@Composable
fun RfLoadingIndicator() {
    Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(
            modifier = Modifier.size(32.dp).semantics { contentDescription = "Loading more recipes" },
            color = Rf.colors.primary,
            trackColor = Rf.colors.primaryContainer
        )
    }
}

enum class RfButtonStyle { Filled, Tonal, Text, Error }

@Composable
fun RfButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: RfButtonStyle = RfButtonStyle.Filled,
    enabled: Boolean = true
) {
    val c = Rf.colors
    val (container, content) = when (style) {
        RfButtonStyle.Filled -> c.primary to c.onPrimary
        RfButtonStyle.Tonal -> c.primaryContainer to c.onPrimaryContainer
        RfButtonStyle.Text -> Color.Transparent to c.primary
        RfButtonStyle.Error -> c.error to c.onError
    }
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = 56.dp),
        enabled = enabled,
        shape = RfShapes.pill,
        colors = ButtonDefaults.buttonColors(
            containerColor = container,
            contentColor = content,
            disabledContainerColor = if (style == RfButtonStyle.Text) Color.Transparent else c.outline,
            disabledContentColor = c.muted
        ),
        elevation = null,
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp)
    ) {
        Text(label, style = RfType.label, textAlign = TextAlign.Center)
    }
}

/** Compact text action used inside cards. */
@Composable
fun RfTextAction(label: String, onClick: () -> Unit, description: String = label) {
    TextButton(
        onClick = onClick,
        modifier = Modifier.semantics { contentDescription = description },
        colors = ButtonDefaults.textButtonColors(contentColor = Rf.colors.primary)
    ) { Text(label, style = RfType.label) }
}

@Composable
fun RfTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    help: String? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None
) {
    val c = Rf.colors
    var focused by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            textStyle = RfType.body.copy(color = c.text),
            singleLine = singleLine,
            minLines = if (singleLine) 1 else minLines,
            keyboardOptions = keyboardOptions,
            visualTransformation = visualTransformation,
            cursorBrush = SolidColor(c.primary),
            decorationBox = { inner ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 56.dp)
                        .background(c.card, RfShapes.small)
                        .border(
                            width = if (focused) 2.dp else 1.dp,
                            color = if (focused) c.primary else c.outlineControl,
                            shape = RfShapes.small
                        )
                        .padding(start = 15.dp, end = 15.dp, top = 3.dp, bottom = 7.dp)
                ) {
                    Text(label, style = RfType.caption, color = c.muted)
                    Spacer(Modifier.height(4.dp))
                    inner()
                }
            }
        )
        if (help != null) {
            Text(
                help,
                style = RfType.caption,
                color = c.muted,
                modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 4.dp)
            )
        }
    }
}

/** Accent notice box; used for errors, confirmations and parse feedback. */
@Composable
fun RfNotice(text: String, modifier: Modifier = Modifier) {
    val c = Rf.colors
    Text(
        text,
        style = RfType.bodySmall,
        color = c.accent,
        modifier = modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite }
            .background(c.accentContainer, RfShapes.medium)
            .padding(16.dp)
    )
}

@Composable
fun RfCard(
    modifier: Modifier = Modifier,
    container: Color = Rf.colors.card,
    bordered: Boolean = false,
    padding: Dp = 20.dp,
    spacing: Dp = 8.dp,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val c = Rf.colors
    var m = modifier.fillMaxWidth().clip(RfShapes.medium).background(container)
    if (bordered) m = m.border(1.dp, c.outline, RfShapes.medium)
    if (onClick != null) m = m.clickable(role = Role.Button, onClick = onClick)
    Column(m.padding(padding), verticalArrangement = Arrangement.spacedBy(spacing), content = content)
}

@Composable
fun RfRecipeCard(
    name: String,
    meta: String,
    fit: String?,
    onClick: () -> Unit,
    extra: (@Composable ColumnScope.() -> Unit)? = null
) {
    val c = Rf.colors
    RfCard(bordered = true, spacing = 10.dp, onClick = onClick) {
        Text(name, style = RfType.section, color = c.text)
        Text(meta, style = RfType.bodySmall, color = c.muted)
        if (fit != null) {
            Text(
                fit,
                style = RfType.label,
                color = c.onPrimaryContainer,
                modifier = Modifier
                    .padding(top = 14.dp)
                    .fillMaxWidth()
                    .background(c.primaryContainer, RfShapes.small)
                    .padding(horizontal = 12.dp, vertical = 10.dp)
            )
        }
        extra?.invoke(this)
    }
}

enum class RfChipKind { Recognized, Unrecognized, Excluded }

@Composable
fun RfChip(
    label: String,
    kind: RfChipKind,
    onEdit: () -> Unit,
    onRemove: () -> Unit,
    removeDescription: String
) {
    val c = Rf.colors
    val (bg, fg) = when (kind) {
        RfChipKind.Recognized -> c.primaryContainer to c.onPrimaryContainer
        RfChipKind.Unrecognized -> c.accentContainer to c.accent
        RfChipKind.Excluded -> c.card to c.text
    }
    var m = Modifier.height(48.dp).clip(RfShapes.small).background(bg)
    if (kind == RfChipKind.Excluded) m = m.border(1.dp, c.outlineControl, RfShapes.small)
    Row(m, verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .clickable(onClickLabel = "Edit $label", onClick = onEdit)
                .padding(start = 16.dp, end = 8.dp),
            contentAlignment = Alignment.Center
        ) { Text(label, style = RfType.label, color = fg) }
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .width(44.dp)
                .semantics { contentDescription = removeDescription }
                .clickable(role = Role.Button, onClick = onRemove),
            contentAlignment = Alignment.Center
        ) { Text("×", style = RfType.section, color = fg) }
    }
}
