# Pyra Calls — UI Foundation (Wave A+B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Android calls app a real Pyra visual identity, fix the
scroll bug that can make the save button unreachable, and re-order the screens
so the rep sees the work before the counters — with zero server changes.

**Architecture:** A central `PyraTheme` (colors, type, shapes, RTL) plus a
small shared component layer. Every screen is wrapped in a `PyraScreen` /
`PyraListScreen` shell that owns scrolling, edge padding and the bottom action
bar, so no screen can forget to scroll. Screens become thin compositions of
shared components.

**Tech Stack:** Kotlin 2.0.21 · Jetpack Compose (compose-bom 2024.12.01,
Material3 1.3.1) · AGP 8.10.1 · JUnit 4 · Gradle wrapper · Java 17

**Spec:** [`docs/superpowers/specs/2026-08-07-calls-app-ui-foundation-design.md`](../specs/2026-08-07-calls-app-ui-foundation-design.md)
**Backlog:** [`docs/CALL-TRACKING-BACKLOG.md`](../../CALL-TRACKING-BACKLOG.md)

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Working directory for all commands is `pyra-calls-app/`.** Use `./gradlew`
  (Git Bash on Windows). Java 17 is on PATH.
- **Zero server changes in this wave.** No file outside `pyra-calls-app/` may
  be modified except the two docs files.
- **APK must stay under 10 MiB** (`pyra-private` bucket `file_size_limit`).
  Baseline before this wave: **7.87 MB** signed release. Budget: **2.1 MB**.
- **`#F97316` must never be the background of text.** Filled orange surfaces
  carrying text use `#C2410C` (5.16:1 with white). `#F97316` is for strokes,
  borders and small non-text shapes only. Task 2 adds a unit test that fails
  if this is violated.
- **`letterSpacing = 0.sp` on every text style.** Arabic letters join;
  Material's Latin-tuned letter spacing pulls the connecting strokes apart and
  the word reads as broken.
- **All user-facing strings live in `res/values/strings.xml`.** No Kotlin
  string literals in UI. The app is Arabic-only — there is no `values-en`.
- **Never change behaviour in this wave.** Sync, notifications, self-update,
  the mandatory-block logic and `ACTION_DIAL`-only calling stay byte-for-byte
  as they are. Only presentation changes.
- **Existing button/chip copy is deliberately identical to the server's
  `OUTCOME_LABELS`.** Do not reword it.
- **RTL:** `PyraTheme` provides `LayoutDirection.Rtl` once. Delete the four
  per-activity `CompositionLocalProvider(LocalLayoutDirection provides Rtl)`
  wrappers — do not leave duplicates.
- **Commit after every task.** Conventional commits, scope `app`.

### Colour tokens (exact values — used across many tasks)

| Token | Light | Dark |
|---|---|---|
| `BrandFill` (text background) | `0xFFC2410C` | `0xFFC2410C` |
| `BrandText` | `0xFFC2410C` | `0xFFFB923C` |
| `BrandAccent` (non-text only) | `0xFFF97316` | `0xFFF97316` |
| `Background` | `0xFFFAFAF9` | `0xFF131211` |
| `Surface` | `0xFFFFFFFF` | `0xFF201E1D` |
| `OnSurface` | `0xFF1C1917` | `0xFFF5F3F0` |
| `OnSurfaceVariant` | `0xFF57534E` | `0xFFA8A29E` |
| `Outline` | `0xFFE7E5E4` | `0xFF302D2B` |
| `Danger` (overdue) | `0xFFDC2626` | `0xFFFCA5A5` |
| `Cool` (going cold) | `0xFF0E7490` | `0xFF67E8F9` |
| `NoticeContainer` | `0xFFFFF7ED` | `0xFF2A2018` |
| `OnNoticeContainer` | `0xFF7C2D12` | `0xFFFED7AA` |

---

## File Structure

| File | Responsibility |
|---|---|
| `core/Contrast.kt` | WCAG relative luminance + contrast ratio. Pure. |
| `core/CallLogFilter.kt` | The one predicate deciding which call-log rows count. Pure. |
| `ui/theme/Color.kt` | Every colour token as a named `Color`. No logic. |
| `ui/theme/Type.kt` | `FontFamily` + `Typography`, all `letterSpacing = 0`. |
| `ui/theme/Theme.kt` | `PyraTheme` — schemes + typography + shapes + RTL. |
| `ui/components/PyraScreen.kt` | Screen shells (`PyraScreen`, `PyraListScreen`) + shared header. Owns scroll + bottom bar. |
| `ui/components/LeadRow.kt` | One lead/follow-up row with edge stripe, chip and actions. |
| `ui/components/StatTile.kt` | Number + label card. |
| `ui/components/PyraChip.kt` | Selectable chip. Wraps via `FlowRow` at the call site. |
| `ui/components/SectionHeader.kt` | Section title + "shown of total". |
| `ui/components/NoticeCard.kt` | Advisory card (update / hibernation). |
| `res/font/` | Two IBM Plex Sans Arabic weights. |
| `res/drawable/` | Launcher foreground, monochrome, notification silhouette. |
| `res/mipmap-anydpi-v26/` | Adaptive icon XML. |
| `res/values/colors.xml` | `ic_launcher_background` only. |

Screens keep their current paths. `MainActivity`, `QuickAddActivity`,
`CallOutcomeActivity` and `UpdateActivity` each swap `MaterialTheme { Surface { … } }`
for `PyraTheme { … }`.

---

## Task 1: Font gate — prove it fits before anything else is built

Nothing else in this plan is worth doing if the font blows the APK budget.
This task exists to answer that question and nothing else.

**Files:**
- Create: `app/src/main/res/font/ibm_plex_sans_arabic_regular.ttf`
- Create: `app/src/main/res/font/ibm_plex_sans_arabic_semibold.ttf`
- Create: `app/src/main/res/font/pyra_font_family.xml`

**Interfaces:**
- Consumes: nothing.
- Produces: `R.font.pyra_font_family` — a font family resource with weight 400
  and weight 600, consumed by Task 2's `Type.kt`.

- [ ] **Step 1: Record the baseline APK size**

```bash
cd pyra-calls-app
./gradlew :app:assembleRelease
ls -l app/build/outputs/apk/release/app-release.apk
```

Expected: a signed APK around **7.87 MB** (8,254,000 bytes give or take).
Write the exact byte count down — Step 5 compares against it.

If the build fails with a signing error, confirm
`C:/Users/engmo/pyra-keys/signing.properties` exists. Without it the release
build is unsigned but still produces a size-comparable APK; note that and
continue.

- [ ] **Step 2: Add the font files**

Download IBM Plex Sans Arabic (SIL Open Font License 1.1) from
<https://github.com/IBM/plex/releases> — the `IBM-Plex-Sans-Arabic` package.
Take exactly two static TTFs:

| Source file | Destination |
|---|---|
| `IBMPlexSansArabic-Regular.ttf` | `app/src/main/res/font/ibm_plex_sans_arabic_regular.ttf` |
| `IBMPlexSansArabic-SemiBold.ttf` | `app/src/main/res/font/ibm_plex_sans_arabic_semibold.ttf` |

Android resource filenames must be lowercase with underscores — rename exactly
as shown or the build fails with `Invalid file name`.

- [ ] **Step 3: Declare the family**

Create `app/src/main/res/font/pyra_font_family.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<font-family xmlns:android="http://schemas.android.com/apk/res/android">
    <font
        android:font="@font/ibm_plex_sans_arabic_regular"
        android:fontStyle="normal"
        android:fontWeight="400" />
    <font
        android:font="@font/ibm_plex_sans_arabic_semibold"
        android:fontStyle="normal"
        android:fontWeight="600" />
</font-family>
```

- [ ] **Step 4: Build**

```bash
./gradlew :app:assembleRelease
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Measure — this is the gate**

```bash
ls -l app/build/outputs/apk/release/app-release.apk
```

Expected: **under 10,485,760 bytes (10 MiB).**

If it is over, stop and apply the fallbacks in this order, re-measuring after
each:

1. Subset both TTFs to Arabic + Latin + punctuation only (`pyftsubset` from
   `fonttools`: `pyftsubset FONT.ttf --unicodes="U+0000-00FF,U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF,U+2000-206F" --output-file=out.ttf`)
2. Ship weight 400 only; drop the 600 entry from `pyra_font_family.xml` and
   have Task 2 use `FontWeight.Normal` everywhere a semibold was specified
3. Swap to Tajawal (also OFL, lighter files)

Do not proceed to Task 2 until this step passes.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/res/font/
git commit -m "feat(app): bundle IBM Plex Sans Arabic (400/600) for the UI

Measured release APK after adding both weights: <BYTES> bytes, against the
10 MiB pyra-private bucket limit. Baseline before the font was <BASELINE>."
```

Replace `<BYTES>` and `<BASELINE>` with the real numbers from Steps 5 and 1.

---

## Task 2: Theme layer + the contrast guard rail

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/core/Contrast.kt`
- Create: `app/src/test/java/cloud/pyramedia/calls/core/ContrastTest.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/theme/Color.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/theme/Type.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/theme/Theme.kt`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/MainActivity.kt:63-66`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/QuickAddActivity.kt:56-58`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/CallOutcomeActivity.kt:66-68`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/UpdateActivity.kt:71-77`
- Modify: `app/src/main/AndroidManifest.xml:15`

**Interfaces:**
- Consumes: `R.font.pyra_font_family` (Task 1).
- Produces:
  - `PyraTheme(content: @Composable () -> Unit)` — the only theme wrapper.
  - Colour extensions on `MaterialTheme.colorScheme`: standard M3 slots plus
    `PyraExtraColors` accessed via `LocalPyraColors.current` with fields
    `brandAccent: Color`, `danger: Color`, `cool: Color`,
    `noticeContainer: Color`, `onNoticeContainer: Color`.
  - `Contrast.ratio(fg: Int, bg: Int): Double` — takes `0xRRGGBB` ints.

- [ ] **Step 1: Write the failing contrast test**

Create `app/src/test/java/cloud/pyramedia/calls/core/ContrastTest.kt`:

```kotlin
package cloud.pyramedia.calls.core

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * WCAG AA guard rails for the Pyra palette. These are not decorative — the
 * rep reads this screen outdoors in Dubai. The "must fail" test below is
 * deliberate: it stops #F97316 from ever becoming a text background again.
 */
class ContrastTest {
    private val AA = 4.5

    @Test fun whiteOnBrandFillPassesAA() {
        assertTrue(Contrast.ratio(0xFFFFFF, 0xC2410C) >= AA)
    }

    @Test fun whiteOnRawBrandOrangeFailsAA() {
        // #F97316 with white is 2.84:1. If this ever passes, someone widened
        // the palette in the wrong direction.
        assertTrue(Contrast.ratio(0xFFFFFF, 0xF97316) < AA)
    }

    @Test fun brandTextOnDarkSurfacePassesAA() {
        assertTrue(Contrast.ratio(0xFB923C, 0x131211) >= AA)
    }

    @Test fun bodyTextPassesAAOnBothThemes() {
        assertTrue(Contrast.ratio(0x1C1917, 0xFAFAF9) >= AA)
        assertTrue(Contrast.ratio(0xF5F3F0, 0x131211) >= AA)
    }

    @Test fun secondaryTextPassesAAOnBothThemes() {
        assertTrue(Contrast.ratio(0x57534E, 0xFFFFFF) >= AA)
        assertTrue(Contrast.ratio(0xA8A29E, 0x201E1D) >= AA)
    }

    @Test fun noticeCardTextPassesAAOnBothThemes() {
        assertTrue(Contrast.ratio(0x7C2D12, 0xFFF7ED) >= AA)
        assertTrue(Contrast.ratio(0xFED7AA, 0x2A2018) >= AA)
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
./gradlew :app:testDebugUnitTest --tests "cloud.pyramedia.calls.core.ContrastTest"
```

Expected: FAIL — `Unresolved reference: Contrast`.

- [ ] **Step 3: Implement `Contrast`**

Create `app/src/main/java/cloud/pyramedia/calls/core/Contrast.kt`:

```kotlin
package cloud.pyramedia.calls.core

import kotlin.math.pow

/** WCAG 2.1 relative luminance + contrast ratio. Colours are 0xRRGGBB ints. */
object Contrast {

    fun relativeLuminance(rgb: Int): Double {
        val r = channel(((rgb shr 16) and 0xFF) / 255.0)
        val g = channel(((rgb shr 8) and 0xFF) / 255.0)
        val b = channel((rgb and 0xFF) / 255.0)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    fun ratio(fg: Int, bg: Int): Double {
        val a = relativeLuminance(fg)
        val b = relativeLuminance(bg)
        val hi = maxOf(a, b)
        val lo = minOf(a, b)
        return (hi + 0.05) / (lo + 0.05)
    }

    private fun channel(c: Double): Double =
        if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "cloud.pyramedia.calls.core.ContrastTest"
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write `Color.kt`**

Create `app/src/main/java/cloud/pyramedia/calls/ui/theme/Color.kt`:

```kotlin
package cloud.pyramedia.calls.ui.theme

import androidx.compose.ui.graphics.Color

// ── Brand ───────────────────────────────────────────────────────────────
// BrandFill is orange-700, NOT orange-500: white on #F97316 is 2.84:1 and
// fails every WCAG threshold. See core/ContrastTest.
val BrandFill = Color(0xFFC2410C)
val BrandTextLight = Color(0xFFC2410C)
val BrandTextDark = Color(0xFFFB923C)

/** orange-500. Strokes, borders, small non-text shapes ONLY. Never behind text. */
val BrandAccent = Color(0xFFF97316)

// ── Light ───────────────────────────────────────────────────────────────
val LightBackground = Color(0xFFFAFAF9)
val LightSurface = Color(0xFFFFFFFF)
val LightOnSurface = Color(0xFF1C1917)
val LightOnSurfaceVariant = Color(0xFF57534E)
val LightOutline = Color(0xFFE7E5E4)
val LightDanger = Color(0xFFDC2626)
val LightCool = Color(0xFF0E7490)
val LightNoticeContainer = Color(0xFFFFF7ED)
val LightOnNoticeContainer = Color(0xFF7C2D12)

// ── Dark ────────────────────────────────────────────────────────────────
val DarkBackground = Color(0xFF131211)
val DarkSurface = Color(0xFF201E1D)
val DarkOnSurface = Color(0xFFF5F3F0)
val DarkOnSurfaceVariant = Color(0xFFA8A29E)
val DarkOutline = Color(0xFF302D2B)
val DarkDanger = Color(0xFFFCA5A5)
val DarkCool = Color(0xFF67E8F9)
val DarkNoticeContainer = Color(0xFF2A2018)
val DarkOnNoticeContainer = Color(0xFFFED7AA)
```

- [ ] **Step 6: Write `Type.kt`**

Create `app/src/main/java/cloud/pyramedia/calls/ui/theme/Type.kt`:

```kotlin
package cloud.pyramedia.calls.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import cloud.pyramedia.calls.R

val PyraFontFamily = FontFamily(
    Font(R.font.ibm_plex_sans_arabic_regular, FontWeight.Normal),
    Font(R.font.ibm_plex_sans_arabic_semibold, FontWeight.SemiBold),
)

/**
 * Two rules make this Arabic-correct, and both differ from Material's Latin
 * defaults:
 *
 * 1. `letterSpacing = 0.sp` everywhere. Arabic letters join; Material's
 *    positive tracking stretches the connecting strokes and the word reads
 *    as broken.
 * 2. Line heights ~15% above Material's. Arabic dots, hamzas and descenders
 *    collide in Latin-tuned leading.
 *
 * `tnum` on the numeric styles keeps digits the same width so a counter
 * doesn't jump as it ticks 9 → 10.
 */
private fun pyra(
    size: Int,
    lineHeight: Int,
    weight: FontWeight = FontWeight.Normal,
    tabularNums: Boolean = false,
) = TextStyle(
    fontFamily = PyraFontFamily,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = 0.sp,
    fontFeatureSettings = if (tabularNums) "tnum" else null,
)

val PyraTypography = Typography(
    // Hero numbers — 109 / 331
    displaySmall = pyra(32, 40, FontWeight.SemiBold, tabularNums = true),
    // Stat-tile numbers — 49 / 31
    headlineMedium = pyra(26, 34, FontWeight.SemiBold, tabularNums = true),
    // Screen titles
    headlineSmall = pyra(22, 32, FontWeight.SemiBold),
    titleLarge = pyra(22, 32, FontWeight.SemiBold),
    // Section headers
    titleMedium = pyra(17, 26, FontWeight.SemiBold),
    // Lead names
    titleSmall = pyra(15, 23, FontWeight.SemiBold),
    // Body
    bodyLarge = pyra(15, 24),
    bodyMedium = pyra(14, 22),
    bodySmall = pyra(13, 21),
    // Buttons and chips
    labelLarge = pyra(14, 20, FontWeight.SemiBold),
    // Small counters — "20 من 114"
    labelMedium = pyra(12, 18, FontWeight.SemiBold, tabularNums = true),
    labelSmall = pyra(11, 16, FontWeight.SemiBold),
)
```

- [ ] **Step 7: Write `Theme.kt`**

Create `app/src/main/java/cloud/pyramedia/calls/ui/theme/Theme.kt`:

```kotlin
package cloud.pyramedia.calls.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** Colours Material 3 has no slot for. Read via [LocalPyraColors]. */
@Immutable
data class PyraExtraColors(
    val brandAccent: Color,
    val danger: Color,
    val cool: Color,
    val noticeContainer: Color,
    val onNoticeContainer: Color,
)

val LocalPyraColors = staticCompositionLocalOf {
    PyraExtraColors(
        brandAccent = BrandAccent,
        danger = LightDanger,
        cool = LightCool,
        noticeContainer = LightNoticeContainer,
        onNoticeContainer = LightOnNoticeContainer,
    )
}

private val LightScheme = lightColorScheme(
    primary = BrandFill,
    onPrimary = Color.White,
    primaryContainer = LightNoticeContainer,
    onPrimaryContainer = LightOnNoticeContainer,
    background = LightBackground,
    onBackground = LightOnSurface,
    surface = LightSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightBackground,
    onSurfaceVariant = LightOnSurfaceVariant,
    outline = LightOutline,
    outlineVariant = LightOutline,
    error = LightDanger,
    onError = Color.White,
)

private val DarkScheme = darkColorScheme(
    primary = BrandFill,
    onPrimary = Color.White,
    primaryContainer = DarkNoticeContainer,
    onPrimaryContainer = DarkOnNoticeContainer,
    background = DarkBackground,
    onBackground = DarkOnSurface,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = DarkBackground,
    onSurfaceVariant = DarkOnSurfaceVariant,
    outline = DarkOutline,
    outlineVariant = DarkOutline,
    error = DarkDanger,
    onError = Color(0xFF1C1917),
)

private val PyraShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

/**
 * The one theme wrapper. Also provides RTL for the whole tree — the four
 * activities used to each do this themselves.
 */
@Composable
fun PyraTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val extras = if (darkTheme) {
        PyraExtraColors(
            brandAccent = BrandAccent,
            danger = DarkDanger,
            cool = DarkCool,
            noticeContainer = DarkNoticeContainer,
            onNoticeContainer = DarkOnNoticeContainer,
        )
    } else {
        PyraExtraColors(
            brandAccent = BrandAccent,
            danger = LightDanger,
            cool = LightCool,
            noticeContainer = LightNoticeContainer,
            onNoticeContainer = LightOnNoticeContainer,
        )
    }

    CompositionLocalProvider(
        LocalLayoutDirection provides LayoutDirection.Rtl,
        LocalPyraColors provides extras,
    ) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkScheme else LightScheme,
            typography = PyraTypography,
            shapes = PyraShapes,
            content = content,
        )
    }
}
```

Note the `brandText` colour is not in `PyraExtraColors` — `MaterialTheme.colorScheme.primary`
is `BrandFill` in both themes, and orange *text* on a dark surface uses
`LocalPyraColors.current` only where a component needs it. Components that
render orange text read `MaterialTheme.colorScheme.primary` on light and
`DarkOnNoticeContainer`-family tokens on dark via `onPrimaryContainer`.

- [ ] **Step 8: Point the manifest at a Material 3 base theme**

In `app/src/main/AndroidManifest.xml`, replace line 15:

```xml
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
```

with:

```xml
        android:theme="@style/Theme.PyraCalls">
```

Create `app/src/main/res/values/themes.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Pre-Compose window theme only: Compose owns everything after
         setContent. DayNight so the window background follows the system
         instead of flashing white before the first frame in dark mode. -->
    <style name="Theme.PyraCalls" parent="@android:style/Theme.DeviceDefault.DayNight">
        <item name="android:windowActionBar">false</item>
        <item name="android:windowNoTitle">true</item>
    </style>
</resources>
```

- [ ] **Step 9: Swap all four entry points to `PyraTheme`**

`MainActivity.kt` — replace lines 63-66:

```kotlin
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme {
                    Surface {
```

with:

```kotlin
        setContent {
            PyraTheme {
```

and delete the two matching closing braces at the end of `setContent`. Remove
the now-unused imports `androidx.compose.material3.MaterialTheme`,
`androidx.compose.material3.Surface`,
`androidx.compose.ui.platform.LocalLayoutDirection`,
`androidx.compose.ui.unit.LayoutDirection`; add
`cloud.pyramedia.calls.ui.theme.PyraTheme`.

`QuickAddActivity.kt` — replace lines 56-58:

```kotlin
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme { Surface {
```

with:

```kotlin
        setContent {
            PyraTheme {
```

and drop the matching `} }` closers. Same import cleanup.

`CallOutcomeActivity.kt` — identical change at lines 66-68.

`UpdateActivity.kt` — replace lines 71-77:

```kotlin
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme {
                    Surface { UpdateScreen(api) }
                }
            }
        }
```

with:

```kotlin
        setContent {
            PyraTheme { UpdateScreen(api) }
        }
```

- [ ] **Step 10: Build and confirm nothing regressed**

```bash
./gradlew :app:assembleDebug :app:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`, all unit tests pass (the 6 pre-existing suites
plus `ContrastTest`).

- [ ] **Step 11: Commit**

```bash
git add app/src/main/java/cloud/pyramedia/calls/core/Contrast.kt \
        app/src/test/java/cloud/pyramedia/calls/core/ContrastTest.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/theme/ \
        app/src/main/res/values/themes.xml \
        app/src/main/AndroidManifest.xml \
        app/src/main/java/cloud/pyramedia/calls/ui/MainActivity.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/QuickAddActivity.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/CallOutcomeActivity.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/UpdateActivity.kt
git commit -m "feat(app): Pyra theme - brand colours, Arabic type scale, dark mode

Filled orange surfaces use #C2410C, not the brand #F97316: white on
#F97316 is 2.84:1 and fails every WCAG threshold, and the rep reads this
screen outdoors. ContrastTest asserts the pairs and deliberately asserts
that #F97316 still FAILS, so it can never drift back behind text.

Arabic corrections to Material's Latin defaults: letterSpacing is 0 on
every style (positive tracking pulls Arabic joining strokes apart) and
line heights are ~15% taller (dots and hamzas collide otherwise).

RTL moves into PyraTheme; the four per-activity wrappers are deleted."
```

---

## Task 3: `PyraScreen` — make forgetting to scroll impossible (B-01)

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/components/PyraScreen.kt`

**Interfaces:**
- Consumes: `PyraTheme` (Task 2).
- Produces:
  - `PyraScreen(title: String? = null, onBack: (() -> Unit)? = null, bottomBar: @Composable (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit)`
  - `PyraListScreen(title: String? = null, onBack: (() -> Unit)? = null, bottomBar: @Composable (() -> Unit)? = null, content: LazyListScope.() -> Unit)`

- [ ] **Step 1: Create the file**

Create `app/src/main/java/cloud/pyramedia/calls/ui/components/PyraScreen.kt`:

```kotlin
package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R

private val EdgePadding = 20.dp

/**
 * The screen shell every Pyra Calls screen goes through.
 *
 * It owns scrolling, so no screen can forget it — that was B-01, where a
 * larger system font or landscape could push the save button off a fixed
 * Column with no way to reach it.
 *
 * ## Why there are two slots
 *
 * `bottomBar` sits OUTSIDE the scrolling area. A vertical `Modifier.weight()`
 * inside a `verticalScroll` column is meaningless — scrolling gives the column
 * unbounded height, so "take a share of the height" has nothing to divide.
 * `HomeScreen` used `Spacer(Modifier.weight(1f))` to push its sync button down;
 * naively wrapping that column in `verticalScroll` would have broken it. Put
 * any always-visible action in `bottomBar` instead. It also reads better: the
 * save button stays on screen instead of being scrolled to.
 *
 * ## Rule for `content`
 *
 * No vertical `Modifier.weight()` inside `content` — same reason. Horizontal
 * weights inside a `Row` are fine.
 */
@Composable
fun PyraScreen(
    modifier: Modifier = Modifier,
    title: String? = null,
    onBack: (() -> Unit)? = null,
    bottomBar: @Composable (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    PyraShell(modifier, title, onBack, bottomBar) { inner ->
        Column(
            modifier = inner.verticalScroll(rememberScrollState())
                .padding(horizontal = EdgePadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

/**
 * List variant. A `LazyColumn` must NOT be nested in a `verticalScroll`
 * parent — it would be measured with infinite height and crash — so lists get
 * their own shell rather than reusing [PyraScreen].
 */
@Composable
fun PyraListScreen(
    modifier: Modifier = Modifier,
    title: String? = null,
    onBack: (() -> Unit)? = null,
    bottomBar: @Composable (() -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    PyraShell(modifier, title, onBack, bottomBar) { inner ->
        LazyColumn(
            modifier = inner.padding(horizontal = EdgePadding),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
    }
}

@Composable
private fun PyraShell(
    modifier: Modifier,
    title: String?,
    onBack: (() -> Unit)?,
    bottomBar: @Composable (() -> Unit)?,
    body: @Composable (Modifier) -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            if (title != null) {
                ScreenHeader(title = title, onBack = onBack)
            }
            // weight(1f) is legal HERE: this Column has a bounded height.
            // It is not legal inside the scrolling child below.
            body(Modifier.weight(1f).fillMaxWidth())
            if (bottomBar != null) {
                Surface(tonalElevation = 3.dp, color = MaterialTheme.colorScheme.surface) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = EdgePadding, vertical = 12.dp),
                    ) { bottomBar() }
                }
            }
        }
    }
}

@Composable
private fun ScreenHeader(title: String, onBack: (() -> Unit)?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = EdgePadding, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack, modifier = Modifier.size(40.dp)) {
                Icon(
                    imageVector = backIcon(),
                    contentDescription = stringResource(R.string.cd_back),
                )
            }
        }
        Text(title, style = MaterialTheme.typography.headlineSmall)
    }
}

@Composable
private fun backIcon(): ImageVector =
    androidx.compose.material.icons.Icons.AutoMirrored.Filled.ArrowBack
```

- [ ] **Step 2: Add the material-icons dependency**

`Icons.AutoMirrored.Filled.ArrowBack` lives in `material-icons-core`, which is
not currently a dependency. Add to `gradle/libs.versions.toml` under
`[libraries]`:

```toml
androidx-material-icons-core = { group = "androidx.compose.material", name = "material-icons-core" }
```

and to `app/build.gradle.kts` `dependencies`:

```kotlin
    implementation(libs.androidx.material.icons.core)
```

It is BOM-managed, so no version is needed. `AutoMirrored` matters here: the
back arrow must flip in RTL, and the non-mirrored `Icons.Filled.ArrowBack`
would point the wrong way.

- [ ] **Step 3: Add the content-description string**

Append inside `<resources>` in `app/src/main/res/values/strings.xml`:

```xml
    <string name="cd_back">رجوع</string>
```

- [ ] **Step 4: Build**

```bash
./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. Nothing consumes `PyraScreen` yet — this step
only proves it compiles.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/cloud/pyramedia/calls/ui/components/PyraScreen.kt \
        app/src/main/res/values/strings.xml \
        gradle/libs.versions.toml app/build.gradle.kts
git commit -m "feat(app): PyraScreen shell owns scrolling and the bottom action bar

B-01 was eight screens each independently forgetting to scroll. Routing
every screen through one shell makes forgetting impossible.

bottomBar is deliberately outside the scroll area: a vertical weight inside
a verticalScroll column is meaningless, and HomeScreen:156 used exactly that
to push its sync button down, so a naive scroll wrapper would have broken
Home. Persistent actions go in the bar, which also keeps the save button on
screen instead of below the fold."
```

---

## Task 4: The five shared components

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/components/StatTile.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/components/PyraChip.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/components/SectionHeader.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/components/NoticeCard.kt`
- Create: `app/src/main/java/cloud/pyramedia/calls/ui/components/LeadRow.kt`
- Modify: `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `PyraTheme`, `LocalPyraColors` (Task 2).
- Produces:
  - `StatTile(value: String, label: String, accent: Boolean = false, modifier: Modifier = Modifier)`
  - `PyraChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier)`
  - `SectionHeader(title: String, shown: Int, total: Int)`
  - `NoticeCard(title: String, body: String, action: @Composable (() -> Unit)? = null)`
  - `LeadRow(name: String, subtitle: String?, chipText: String, tone: LeadTone, onCall: (() -> Unit)?, trailing: @Composable (RowScope.() -> Unit)? = null)`
  - `enum class LeadTone { Overdue, Cold, Neutral }`

- [ ] **Step 1: `StatTile`**

```kotlin
package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun StatTile(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    accent: Boolean = false,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                value,
                style = MaterialTheme.typography.headlineMedium,
                color = if (accent) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurface,
            )
            Text(
                label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
```

- [ ] **Step 2: `PyraChip`**

```kotlin
package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Selectable chip. Callers MUST lay these out in a `FlowRow`, not a `Row` —
 * that was B-02: three outcome chips in a plain Row clipped
 * «يحتاج إعادة اتصال» off screen at larger system font sizes.
 */
@Composable
fun PyraChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.surface,
        contentColor = if (selected) Color.White
        else MaterialTheme.colorScheme.onSurfaceVariant,
        border = if (selected) null
        else BorderStroke(1.5.dp, MaterialTheme.colorScheme.outline),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(horizontal = 15.dp, vertical = 11.dp),
        )
    }
}
```

- [ ] **Step 3: `SectionHeader`**

```kotlin
package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R

@Composable
fun SectionHeader(title: String, shown: Int, total: Int) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(
            stringResource(R.string.my_day_count, shown, total),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
```

- [ ] **Step 4: `NoticeCard`**

```kotlin
package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.ui.theme.LocalPyraColors

/**
 * Advisory card — the update nag and the hibernation warning. Replaces two
 * hand-written hex pairs in HomeScreen (0xFFFFF3CD / 0xFF664D03) that would
 * have stayed bright yellow on a black screen once dark mode landed (U-03).
 */
@Composable
fun NoticeCard(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    action: @Composable (() -> Unit)? = null,
) {
    val colors = LocalPyraColors.current
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = colors.noticeContainer),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                color = colors.onNoticeContainer,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                body,
                style = MaterialTheme.typography.bodySmall,
                color = colors.onNoticeContainer,
            )
            if (action != null) {
                Spacer(Modifier.height(10.dp))
                action()
            }
        }
    }
}
```

- [ ] **Step 5: `LeadRow`**

```kotlin
package cloud.pyramedia.calls.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.ui.theme.LocalPyraColors

enum class LeadTone { Overdue, Cold, Neutral }

@Composable
fun LeadRow(
    name: String,
    chipText: String,
    tone: LeadTone,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onCall: (() -> Unit)? = null,
    trailing: @Composable (RowScope.() -> Unit)? = null,
) {
    val pyra = LocalPyraColors.current
    val toneColor = when (tone) {
        LeadTone.Overdue -> pyra.danger
        LeadTone.Cold -> pyra.cool
        LeadTone.Neutral -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        // IntrinsicSize.Min is what lets the 4dp edge stripe below stretch to
        // the card's own height instead of collapsing to zero.
        Row(
            Modifier.height(IntrinsicSize.Min),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(toneColor),
            )
            Row(
                Modifier.padding(horizontal = 13.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        name,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (subtitle != null) {
                        Text(
                            subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        chipText,
                        style = MaterialTheme.typography.labelSmall,
                        color = toneColor,
                    )
                }
                if (trailing != null) {
                    Spacer(Modifier.width(8.dp))
                    trailing()
                }
                if (onCall != null) {
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        onClick = onCall,
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(40.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                painter = painterResource(R.drawable.ic_call),
                                contentDescription = stringResource(R.string.cd_call, name),
                                tint = Color.White,
                            )
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 6: Add the call icon and content-description strings**

Create `app/src/main/res/drawable/ic_call.xml`:

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24"
    android:tint="?android:attr/colorControlNormal"
    android:autoMirrored="true">
    <path
        android:fillColor="@android:color/white"
        android:pathData="M6.6,10.8c1.4,2.8 3.8,5.1 6.6,6.6l2.2,-2.2c0.3,-0.3 0.7,-0.4 1,-0.2 1.1,0.4 2.4,0.6 3.6,0.6 0.6,0 1,0.4 1,1V20c0,0.6 -0.4,1 -1,1C11,21 3,13 3,3c0,-0.6 0.4,-1 1,-1h3.5c0.6,0 1,0.4 1,1 0,1.3 0.2,2.5 0.6,3.6 0.1,0.4 0,0.7 -0.2,1l-2.3,2.2z" />
</vector>
```

Append to `strings.xml`:

```xml
    <string name="cd_call">اتصال بـ %1$s</string>
```

- [ ] **Step 7: Build**

```bash
./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 8: Commit**

```bash
git add app/src/main/java/cloud/pyramedia/calls/ui/components/ \
        app/src/main/res/drawable/ic_call.xml \
        app/src/main/res/values/strings.xml
git commit -m "feat(app): shared component layer - LeadRow, StatTile, PyraChip, SectionHeader, NoticeCard

Written once so the same card cannot drift into three variants across
my-day, Home and the outcome sheet. NoticeCard is where the two hand-written
hex pairs in HomeScreen die - they would have stayed bright yellow on a
black screen once dark mode landed.

Every icon carries a contentDescription; the call button's includes the lead
name so a screen reader announces who is being dialled."
```

---

## Task 5: `CallLogFilter` — one predicate, two readers (B-07)

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/core/CallLogFilter.kt`
- Create: `app/src/test/java/cloud/pyramedia/calls/core/CallLogFilterTest.kt`
- Modify: `app/src/main/java/cloud/pyramedia/calls/data/CallLogReader.kt:31-44`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/HomeScreen.kt:30-36`

**Interfaces:**
- Consumes: `CallMapping.directionFor` (existing).
- Produces:
  - `CallLogFilter.isSyncable(callLogType: Int, phone: String?): Boolean`
  - `CallLogFilter.isConnected(callLogType: Int, durationSeconds: Int): Boolean`
  - `data class CallCounts(val total: Int, val connected: Int)`

- [ ] **Step 1: Write the failing test**

Create `app/src/test/java/cloud/pyramedia/calls/core/CallLogFilterTest.kt`:

```kotlin
package cloud.pyramedia.calls.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Home counter and the syncer must agree on what counts as a work call.
 * They did not: the counter counted every call-log row, while the syncer
 * skipped unmapped types and withheld numbers (B-07). These tests are what
 * stops them drifting apart again.
 */
class CallLogFilterTest {

    @Test fun countsTheTypesTheSyncerSends() {
        assertTrue(CallLogFilter.isSyncable(1, "0501234567"))  // incoming
        assertTrue(CallLogFilter.isSyncable(2, "0501234567"))  // outgoing
        assertTrue(CallLogFilter.isSyncable(3, "0501234567"))  // missed
        assertTrue(CallLogFilter.isSyncable(5, "0501234567"))  // rejected
    }

    @Test fun skipsTheTypesTheSyncerDrops() {
        assertFalse(CallLogFilter.isSyncable(4, "0501234567"))  // voicemail
        assertFalse(CallLogFilter.isSyncable(6, "0501234567"))  // blocked
        assertFalse(CallLogFilter.isSyncable(7, "0501234567"))  // answered elsewhere
    }

    @Test fun skipsWithheldNumbers() {
        assertFalse(CallLogFilter.isSyncable(2, null))
        assertFalse(CallLogFilter.isSyncable(2, ""))
        assertFalse(CallLogFilter.isSyncable(2, "   "))
    }

    @Test fun connectedMatchesTheServerPredicate() {
        // Mirrors lib/calls/match.ts isConnectedCall():
        // direction != missed AND duration > 0
        assertTrue(CallLogFilter.isConnected(2, 45))
        assertTrue(CallLogFilter.isConnected(1, 1))
        assertFalse(CallLogFilter.isConnected(2, 0))   // dial nobody answered
        assertFalse(CallLogFilter.isConnected(3, 0))   // missed
        assertFalse(CallLogFilter.isConnected(3, 30))  // missed, any duration
        assertFalse(CallLogFilter.isConnected(5, 0))   // rejected
    }

    @Test fun unsyncableRowsAreNeverConnected() {
        assertFalse(CallLogFilter.isConnected(4, 60))
        assertFalse(CallLogFilter.isConnected(6, 60))
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
./gradlew :app:testDebugUnitTest --tests "cloud.pyramedia.calls.core.CallLogFilterTest"
```

Expected: FAIL — `Unresolved reference: CallLogFilter`.

- [ ] **Step 3: Implement**

Create `app/src/main/java/cloud/pyramedia/calls/core/CallLogFilter.kt`:

```kotlin
package cloud.pyramedia.calls.core

/**
 * The single answer to "does this call-log row count as work?".
 *
 * Before this existed, `HomeScreen.countSince` counted every row in the call
 * log while `CallLogReader.readBatch` skipped unmapped types and withheld
 * numbers — so the number on Home could never match the CRM, for reasons that
 * had nothing to do with sync lag. Both now call in here.
 */
object CallLogFilter {

    /** True iff the syncer would send this row to the server. */
    fun isSyncable(callLogType: Int, phone: String?): Boolean {
        if (CallMapping.directionFor(callLogType) == null) return false
        return !phone.isNullOrBlank()
    }

    /**
     * True iff the call actually connected — the same predicate the server
     * uses in `lib/calls/match.ts::isConnectedCall()`:
     * `direction != 'missed' && duration_seconds > 0`.
     *
     * A 0-second outgoing call is a dial nobody answered. It is real and it is
     * counted, but it is not contact.
     */
    fun isConnected(callLogType: Int, durationSeconds: Int): Boolean {
        val direction = CallMapping.directionFor(callLogType) ?: return false
        return direction != "missed" && durationSeconds > 0
    }
}

/** Result of a local call-log tally. */
data class CallCounts(val total: Int, val connected: Int)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "cloud.pyramedia.calls.core.CallLogFilterTest"
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Route the syncer through it**

In `CallLogReader.kt`, replace lines 34-36:

```kotlin
                val direction = CallMapping.directionFor(c.getInt(iType)) ?: continue
                val phone = c.getString(iNum).orEmpty()
                if (phone.isBlank()) continue // withheld/private number — nothing to match or count against a lead
```

with:

```kotlin
                val type = c.getInt(iType)
                val phone = c.getString(iNum).orEmpty()
                if (!CallLogFilter.isSyncable(type, phone)) continue
                val direction = CallMapping.directionFor(type) ?: continue
```

Add `import cloud.pyramedia.calls.core.CallLogFilter` to the imports.

Behaviour is unchanged — the predicate is identical, it just lives in one place
now. The `?: continue` on the second line is unreachable after the guard but
keeps `direction` non-null without a `!!`.

- [ ] **Step 6: Route the Home counter through it**

In `HomeScreen.kt`, replace the whole `countSince` function (lines 30-36):

```kotlin
private fun countSince(context: Context, sinceMillis: Long): Int {
    context.contentResolver.query(
        CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls._ID),
        "${CallLog.Calls.DATE} >= ?", arrayOf(sinceMillis.toString()), null,
    )?.use { return it.count }
    return 0
}
```

with:

```kotlin
/**
 * Tally the local call log using the EXACT predicate the syncer uses, so the
 * number on Home and the number in the CRM are the same number at two points
 * in time — the only gap being sync lag, which the sync chip already shows.
 */
private fun countSince(context: Context, sinceMillis: Long): CallCounts {
    var total = 0
    var connected = 0
    context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DURATION),
        "${CallLog.Calls.DATE} >= ?", arrayOf(sinceMillis.toString()), null,
    )?.use { c ->
        val iNum = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
        val iType = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
        val iDur = c.getColumnIndexOrThrow(CallLog.Calls.DURATION)
        while (c.moveToNext()) {
            val type = c.getInt(iType)
            if (!CallLogFilter.isSyncable(type, c.getString(iNum))) continue
            total++
            if (CallLogFilter.isConnected(type, c.getInt(iDur))) connected++
        }
    }
    return CallCounts(total, connected)
}
```

Add imports `cloud.pyramedia.calls.core.CallLogFilter` and
`cloud.pyramedia.calls.core.CallCounts`.

Update the two call sites at lines 47-48 to hold `CallCounts`:

```kotlin
    val today = remember(refreshTick) { countSince(context, DubaiTime.dayStartMillis(now)) }
    val month = remember(refreshTick) { countSince(context, DubaiTime.monthStartMillis(now)) }
```

and change the two `Text("$todayCount", …)` / `Text("$monthCount", …)` usages
at lines 134 and 141 to `Text("${today.total}", …)` and
`Text("${month.total}", …)`. Task 7 replaces this whole block anyway; this step
only keeps the file compiling.

- [ ] **Step 7: Run the full test suite and build**

```bash
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`, all suites pass.

- [ ] **Step 8: Commit**

```bash
git add app/src/main/java/cloud/pyramedia/calls/core/CallLogFilter.kt \
        app/src/test/java/cloud/pyramedia/calls/core/CallLogFilterTest.kt \
        app/src/main/java/cloud/pyramedia/calls/data/CallLogReader.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/HomeScreen.kt
git commit -m "fix(app): one call-log predicate for both the counter and the syncer

The phone is the source of truth for calls and the server is a lagging copy
of it, so the Home counter is right to be local. What was wrong is that the
counter and the syncer read the same log through different filters: the
counter counted every row, the syncer skipped voicemail/blocked/answered-
elsewhere types and withheld numbers. The number on Home could therefore
never match the CRM for reasons unrelated to sync lag.

CallLogFilter is now the only answer to 'does this row count', and the test
fails if the two readers are ever pulled apart again. It also yields the
connected count for free, using the server's own isConnectedCall predicate."
```

---

## Task 6: App icon and notification icon (U-01, U-04)

**Files:**
- Create: `app/src/main/res/drawable/ic_launcher_foreground.xml`
- Create: `app/src/main/res/drawable/ic_launcher_monochrome.xml`
- Create: `app/src/main/res/drawable/ic_notification.xml`
- Create: `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- Create: `app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- Create: `app/src/main/res/values/colors.xml`
- Modify: `app/src/main/AndroidManifest.xml:9-15`
- Modify: `app/src/main/java/cloud/pyramedia/calls/notify/Notifier.kt:76,93,127,145`

**Interfaces:**
- Consumes: nothing.
- Produces: `R.mipmap.ic_launcher`, `R.drawable.ic_notification`.

- [ ] **Step 1: The pyramid, sized for the adaptive safe zone**

An adaptive icon's canvas is 108×108dp but only the centre **72×72dp** is
guaranteed visible — launchers mask the rest. The artwork below is drawn on a
108 viewport and stays inside that centre square.

Create `app/src/main/res/drawable/ic_launcher_foreground.xml`:

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:strokeColor="#FFFFFF"
        android:strokeWidth="6"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="M38,68 L47,44 L54,62 L61,44 L70,68" />
    <path
        android:strokeColor="#FFFFFF"
        android:strokeWidth="5"
        android:strokeLineJoin="round"
        android:strokeAlpha="0.62"
        android:pathData="M54,36 L60,49 L54,62 L48,49 Z" />
</vector>
```

- [ ] **Step 2: Monochrome layer**

Android 13+ (Samsung One UI 5+) tints icons to the system theme. Without a
monochrome layer the app shows as a flat block in themed mode.

Create `app/src/main/res/drawable/ic_launcher_monochrome.xml` — identical
geometry, `#000000` strokes (the system recolours it):

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:strokeColor="#000000"
        android:strokeWidth="6"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="M38,68 L47,44 L54,62 L61,44 L70,68" />
    <path
        android:strokeColor="#000000"
        android:strokeWidth="5"
        android:strokeLineJoin="round"
        android:pathData="M54,36 L60,49 L54,62 L48,49 Z" />
</vector>
```

- [ ] **Step 3: Background colour and adaptive icon**

Create `app/src/main/res/values/colors.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#C2410C</color>
</resources>
```

Create `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
```

Create `app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` with
identical content.

- [ ] **Step 4: Notification icon — white silhouette only**

Android strips all colour from a status-bar icon and renders it as a white
silhouette. A coloured icon becomes a white blob.

Create `app/src/main/res/drawable/ic_notification.xml`:

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:strokeColor="#FFFFFF"
        android:strokeWidth="2.4"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="M3,18 L8,7 L12,15 L16,7 L21,18" />
</vector>
```

- [ ] **Step 5: Wire the manifest**

In `app/src/main/AndroidManifest.xml`, add to the `<application>` tag
(alongside the existing `android:label`):

```xml
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
```

- [ ] **Step 6: Replace the four system notification icons**

In `Notifier.kt`, replace all four `setSmallIcon` calls:

| Line | From | To |
|---|---|---|
| 76 | `.setSmallIcon(android.R.drawable.sym_call_missed)` | `.setSmallIcon(R.drawable.ic_notification)` |
| 93 | `.setSmallIcon(android.R.drawable.ic_dialog_info)` | `.setSmallIcon(R.drawable.ic_notification)` |
| 127 | `.setSmallIcon(android.R.drawable.ic_dialog_info)` | `.setSmallIcon(R.drawable.ic_notification)` |
| 145 | `.setSmallIcon(android.R.drawable.stat_sys_download)` | `.setSmallIcon(R.drawable.ic_notification)` |

Also give each builder a brand accent colour so the notification shade tints
the icon. Add to all four builders, immediately after `setSmallIcon`:

```kotlin
                .setColor(0xFFC2410C.toInt())
```

`R` is already imported in this file.

- [ ] **Step 7: Build and install to the emulator**

```bash
./gradlew :app:installDebug
```

Expected: `BUILD SUCCESSFUL`. Then check on the emulator: the launcher icon is
an orange tile with a white pyramid, and it is not clipped by the launcher's
mask.

- [ ] **Step 8: Commit**

```bash
git add app/src/main/res/drawable/ic_launcher_foreground.xml \
        app/src/main/res/drawable/ic_launcher_monochrome.xml \
        app/src/main/res/drawable/ic_notification.xml \
        app/src/main/res/mipmap-anydpi-v26/ \
        app/src/main/res/values/colors.xml \
        app/src/main/AndroidManifest.xml \
        app/src/main/java/cloud/pyramedia/calls/notify/Notifier.kt
git commit -m "feat(app): Pyra launcher and notification icons

The manifest had no android:icon and there was no mipmap directory at all,
so the fleet has been showing the default Android robot since v1.0.

Vector only - under 5 KB for all three layers, sharp at every density, no
five-size PNG set. The artwork stays inside the adaptive icon's guaranteed
72dp centre so launcher masks cannot clip it, and there is a monochrome
layer because One UI 5+ renders themed icons as a flat block without one.

The notification icon is a white silhouette: Android strips colour from
status-bar icons, so anything coloured arrives as a white blob."
```

---

## Task 7: Home screen (U-06, B-08, U-03, F-05)

**Files:**
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/HomeScreen.kt` (full rewrite of the composable body)
- Modify: `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `PyraScreen`, `StatTile`, `NoticeCard` (Tasks 3-4); `CallLogFilter`,
  `CallCounts` (Task 5); `ApiClient.myDay()` (existing).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the strings**

Append inside `<resources>`:

```xml
    <string name="home_work_card_title">شغل النهاردة</string>
    <string name="home_work_follow_ups">متابعة مستحقة</string>
    <string name="home_work_cold">عميل برد</string>
    <string name="home_work_loading">جارٍ التحميل…</string>
    <string name="home_work_failed">تعذر تحميل الشغل — اضغط لإعادة المحاولة</string>
    <string name="home_work_empty">مفيش شغل مستحق النهاردة</string>
    <string name="home_calls_today">مكالمة النهاردة</string>
    <string name="home_calls_connected">وصلت فعلًا</string>
    <string name="home_week_title">آخر ٧ أيام</string>
    <string name="home_week_total">%1$d مكالمة</string>
    <string name="cd_open_my_day">افتح شغل النهاردة</string>
```

- [ ] **Step 2: Add the 7-day tally**

`countSince` (Task 5) already returns `CallCounts`. Add a day-by-day tally
below it in `HomeScreen.kt`:

```kotlin
/** Per-day totals for the last 7 Dubai days, oldest first. Local only. */
private fun lastSevenDays(context: Context, now: Long): List<Int> {
    val dayStart = DubaiTime.dayStartMillis(now)
    val oneDay = 24L * 60 * 60 * 1000
    return (6 downTo 0).map { back ->
        val from = dayStart - back * oneDay
        val to = from + oneDay
        var n = 0
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE),
            "${CallLog.Calls.DATE} >= ? AND ${CallLog.Calls.DATE} < ?",
            arrayOf(from.toString(), to.toString()), null,
        )?.use { c ->
            val iNum = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val iType = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
            while (c.moveToNext()) {
                if (CallLogFilter.isSyncable(c.getInt(iType), c.getString(iNum))) n++
            }
        }
        n
    }
}
```

Dubai has no DST, so fixed 24-hour arithmetic off the day start is exact.

- [ ] **Step 3: Add the work-card state holder**

Above the `HomeScreen` composable:

```kotlin
private sealed class WorkState {
    data object Loading : WorkState()
    data class Loaded(val followUps: Int, val cold: Int) : WorkState()
    data object Failed : WorkState()
}
```

- [ ] **Step 4: Rewrite the `HomeScreen` composable**

Replace the entire body of `HomeScreen` (currently lines 38-202) with:

```kotlin
@Composable
fun HomeScreen(
    prefs: AppPrefs,
    api: ApiClient,
    onOpenMyDay: () -> Unit,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var refreshTick by remember { mutableIntStateOf(0) }
    var checkingUpdate by remember { mutableStateOf(false) }
    var work by remember { mutableStateOf<WorkState>(WorkState.Loading) }

    val upToDateMsg = stringResource(R.string.home_up_to_date)
    val checkFailedMsg = stringResource(R.string.home_check_failed)
    val now = System.currentTimeMillis()
    val today = remember(refreshTick) { countSince(context, DubaiTime.dayStartMillis(now)) }
    val week = remember(refreshTick) { lastSevenDays(context, now) }
    val lastSync = prefs.lastSyncAtMillis
    val synced = lastSync > 0 && now - lastSync < 30 * 60 * 1000
    val hibernationRestricted by rememberUnusedAppRestrictionsEnabled()
    val pendingUpdate = rememberPendingUpdate(prefs)

    fun loadWork() {
        work = WorkState.Loading
        scope.launch {
            val res = withContext(Dispatchers.IO) { api.myDay() }
            work = when (res) {
                is ApiResult.Ok -> WorkState.Loaded(
                    followUps = res.data.counts.follow_ups,
                    cold = res.data.counts.going_cold,
                )
                else -> WorkState.Failed
            }
        }
    }

    LaunchedEffect(refreshTick) { loadWork() }

    PyraScreen(
        bottomBar = {
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { SyncScheduler.syncNow(context); refreshTick++ },
            ) { Text(stringResource(R.string.home_sync_now)) }
        },
    ) {
        // Greeting + sync status. The status is a plain indicator, NOT a
        // button: the old AssistChip(onClick = {}) looked tappable and did
        // nothing (B-08). The real sync action lives in the bottom bar.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.home_hello, prefs.displayName ?: ""),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f),
            )
            SyncStatus(synced = synced)
        }

        if (UpdatePolicy.shouldShowBanner(pendingUpdate.value.versionCode, BuildConfig.VERSION_CODE)) {
            NoticeCard(
                title = stringResource(R.string.home_update_banner_title),
                body = stringResource(R.string.home_update_banner_body, pendingUpdate.value.versionName ?: ""),
                action = {
                    Button(onClick = {
                        context.startActivity(Intent(context, UpdateActivity::class.java))
                    }) { Text(stringResource(R.string.home_update_banner_button)) }
                },
            )
        }

        if (hibernationRestricted) {
            NoticeCard(
                title = stringResource(R.string.hibernation_title),
                body = stringResource(R.string.hibernation_body),
                action = { HibernationExemptionButton() },
            )
        }

        WorkCard(state = work, onOpen = onOpenMyDay, onRetry = { loadWork() })

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile(
                value = "${today.total}",
                label = stringResource(R.string.home_calls_today),
                accent = true,
                modifier = Modifier.weight(1f),
            )
            StatTile(
                value = "${today.connected}",
                label = stringResource(R.string.home_calls_connected),
                modifier = Modifier.weight(1f),
            )
        }

        WeekStrip(week)

        Text(
            if (lastSync > 0)
                stringResource(R.string.home_last_sync, DateFormat.getTimeFormat(context).format(Date(lastSync)))
            else stringResource(R.string.home_last_sync_never),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(
                stringResource(R.string.home_version, BuildConfig.VERSION_NAME),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                enabled = !checkingUpdate,
                onClick = {
                    checkingUpdate = true
                    scope.launch {
                        // Manual check bypasses UpdatePolicy.shouldCheck's 6h
                        // throttle by design — the user explicitly asked.
                        val res = withContext(Dispatchers.IO) { api.appVersion() }
                        checkingUpdate = false
                        when (res) {
                            is ApiResult.Ok -> {
                                val latest = res.data.latest
                                if (latest != null && latest.version_code > BuildConfig.VERSION_CODE) {
                                    context.startActivity(Intent(context, UpdateActivity::class.java))
                                } else {
                                    Toast.makeText(context, upToDateMsg, Toast.LENGTH_SHORT).show()
                                }
                            }
                            else -> Toast.makeText(context, checkFailedMsg, Toast.LENGTH_SHORT).show()
                        }
                    }
                },
            ) {
                Text(stringResource(
                    if (checkingUpdate) R.string.home_checking_update else R.string.home_check_update,
                ))
            }
        }

        TextButton(modifier = Modifier.fillMaxWidth(), onClick = onLogout) {
            Text(stringResource(R.string.home_logout))
        }
    }
}
```

- [ ] **Step 5: Add the three private composables**

Append to `HomeScreen.kt`:

```kotlin
@Composable
private fun SyncStatus(synced: Boolean) {
    val pyra = LocalPyraColors.current
    val color = if (synced) pyra.cool else pyra.danger
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(
            stringResource(if (synced) R.string.home_synced else R.string.home_not_synced),
            style = MaterialTheme.typography.labelMedium,
            color = color,
        )
    }
}

/**
 * The thesis of the screen: what the rep should do, before how much he has
 * already done. The whole card is the button — there is no separate
 * "open my day" control any more.
 *
 * The numbers come from the server, but the call counts above do not. A
 * network failure therefore darkens this card only; the rep in the street
 * with no signal still sees his own call tally.
 */
@Composable
private fun WorkCard(state: WorkState, onOpen: () -> Unit, onRetry: () -> Unit) {
    val shape = MaterialTheme.shapes.large
    Surface(
        onClick = if (state is WorkState.Failed) onRetry else onOpen,
        shape = shape,
        color = MaterialTheme.colorScheme.primary,
        contentColor = Color.White,
        modifier = Modifier.fillMaxWidth().semantics {
            contentDescription = ""
        },
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                stringResource(R.string.home_work_card_title),
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(14.dp))
            when (state) {
                is WorkState.Loading -> Text(
                    stringResource(R.string.home_work_loading),
                    style = MaterialTheme.typography.bodyMedium,
                )
                is WorkState.Failed -> Text(
                    stringResource(R.string.home_work_failed),
                    style = MaterialTheme.typography.bodyMedium,
                )
                is WorkState.Loaded ->
                    if (state.followUps == 0 && state.cold == 0) {
                        Text(
                            stringResource(R.string.home_work_empty),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            WorkCell(state.followUps, stringResource(R.string.home_work_follow_ups), Modifier.weight(1f))
                            WorkCell(state.cold, stringResource(R.string.home_work_cold), Modifier.weight(1f))
                        }
                    }
            }
        }
    }
}

@Composable
private fun WorkCell(value: Int, label: String, modifier: Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = Color.White.copy(alpha = 0.16f),
        contentColor = Color.White,
    ) {
        Column(Modifier.padding(13.dp)) {
            Text("$value", style = MaterialTheme.typography.displaySmall)
            Text(label, style = MaterialTheme.typography.bodySmall)
        }
    }
}

/** Calls per day for the last 7 Dubai days. Local data — always available. */
@Composable
private fun WeekStrip(days: List<Int>) {
    val max = (days.maxOrNull() ?: 0).coerceAtLeast(1)
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(15.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    stringResource(R.string.home_week_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    stringResource(R.string.home_week_total, days.sum()),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.fillMaxWidth().height(56.dp),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                days.forEach { n ->
                    Column(
                        Modifier.weight(1f),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Bottom,
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height((44f * n / max).dp.coerceAtLeast(3.dp))
                                .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                .background(LocalPyraColors.current.brandAccent),
                        )
                        Spacer(Modifier.height(5.dp))
                        Text(
                            "$n",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
```

Remove the now-unused `import androidx.compose.ui.graphics.Color` duplicate if
the IDE flags it, and add: `androidx.compose.foundation.background`,
`androidx.compose.foundation.shape.CircleShape`,
`androidx.compose.foundation.shape.RoundedCornerShape`,
`androidx.compose.ui.draw.clip`,
`androidx.compose.ui.semantics.contentDescription`,
`androidx.compose.ui.semantics.semantics`,
`cloud.pyramedia.calls.ui.components.*`,
`cloud.pyramedia.calls.ui.theme.LocalPyraColors`.

- [ ] **Step 6: Pass `api` into `HomeScreen` from `MainActivity`**

In `MainActivity.kt`, the Home branch currently reads:

```kotlin
                                    HomeScreen(prefs, onOpenMyDay = { showMyDay = true }) {
```

Change to:

```kotlin
                                    HomeScreen(prefs, api, onOpenMyDay = { showMyDay = true }) {
```

- [ ] **Step 7: Build and run on the emulator**

```bash
./gradlew :app:installDebug
```

Expected: `BUILD SUCCESSFUL`. On the emulator, Home shows the orange work card
first, then the two stat tiles, then the week strip. Toggle the emulator to
dark mode (Settings → Display → Dark theme) and confirm the notice cards are
readable.

- [ ] **Step 8: Commit**

```bash
git add app/src/main/java/cloud/pyramedia/calls/ui/HomeScreen.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/MainActivity.kt \
        app/src/main/res/values/strings.xml
git commit -m "feat(app): Home leads with the work, not the counters

The two biggest things on the old Home were call counters, and the numbers
that actually govern the rep's day - 114 follow-ups due and 331 leads going
cold - appeared nowhere. The orange card now carries them and is itself the
button; the counters drop to a second tier and gain a connected count beside
them, because 49 dials with 31 answered is the honest figure.

Home now calls my-day, so it has network states it did not have before. The
call tallies stay local and keep rendering when that call fails: a rep in the
street with no signal must not open the app to a blank screen.

The sync chip was AssistChip(onClick = {}) - it looked tappable and did
nothing. It is now a plain indicator and the real sync action is a labelled
button in the bottom bar."
```

---

## Task 8: My-day screen (U-07)

**Files:**
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/MyDayScreen.kt` (full rewrite)
- Modify: `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `PyraListScreen`, `LeadRow`, `LeadTone`, `SectionHeader`,
  `PyraChip` (Tasks 3-4); `ApiClient.myDay()`, `MyDayData` (existing).

- [ ] **Step 1: Add the strings**

```xml
    <string name="my_day_tab_follow_ups">متابعات</string>
    <string name="my_day_tab_cold">عملاء برد</string>
    <string name="my_day_refresh">تحديث</string>
```

- [ ] **Step 2: Rewrite the screen**

Two tabs, not three. The design calls for «متأخرة / النهاردة / برد», but
`counts.follow_ups` merges overdue and pending into one number (backlog B-10)
and counting the returned rows is wrong because they are capped at 20. Showing
a wrong number is worse than showing a coarser true one, so the overdue split
waits for the server change in wave C.

Replace the body of `MyDayScreen`:

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyDayScreen(api: ApiClient, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<MyDayState>(MyDayState.Loading) }
    var tab by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    val netErrorMsg = stringResource(R.string.net_error)

    fun fetch(isRefresh: Boolean = false) {
        if (!isRefresh) state = MyDayState.Loading
        scope.launch {
            val res = withContext(Dispatchers.IO) { api.myDay() }
            state = when (res) {
                is ApiResult.Ok -> MyDayState.Loaded(res.data)
                is ApiResult.Err -> MyDayState.Failed(res.message)
                ApiResult.NetworkError -> MyDayState.Failed(netErrorMsg)
            }
            refreshing = false
        }
    }

    LaunchedEffect(Unit) { fetch() }

    // ACTION_DIAL only — opens the dialer pre-filled, needs no permission, and
    // lets the agent confirm. ACTION_CALL would need CALL_PHONE (the app must
    // never hold it) and would place the call with no confirmation.
    val onCall: (String) -> Unit = { phone ->
        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
    }

    PyraListScreen(title = stringResource(R.string.my_day_title), onBack = onBack) {
        when (val s = state) {
            is MyDayState.Loading -> item {
                Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is MyDayState.Failed -> item {
                Column(
                    Modifier.fillMaxWidth().padding(top = 48.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(s.message, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { fetch() }) { Text(stringResource(R.string.my_day_retry)) }
                }
            }
            is MyDayState.Loaded -> {
                val d = s.data
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PyraChip(
                            label = "${stringResource(R.string.my_day_tab_follow_ups)} ${d.counts.follow_ups}",
                            selected = tab == 0,
                            onClick = { tab = 0 },
                            modifier = Modifier.weight(1f),
                        )
                        PyraChip(
                            label = "${stringResource(R.string.my_day_tab_cold)} ${d.counts.going_cold}",
                            selected = tab == 1,
                            onClick = { tab = 1 },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                if (tab == 0) {
                    item {
                        SectionHeader(
                            stringResource(R.string.my_day_section_follow_ups),
                            d.follow_ups.size, d.counts.follow_ups,
                        )
                    }
                    if (d.follow_ups.isEmpty()) {
                        item { EmptySectionCard(stringResource(R.string.my_day_empty_follow_ups)) }
                    } else {
                        items(d.follow_ups, key = { it.id }) { FollowUpRow(it, onCall) }
                    }
                } else {
                    item {
                        SectionHeader(
                            stringResource(R.string.my_day_section_going_cold),
                            d.going_cold.size, d.counts.going_cold,
                        )
                    }
                    if (d.going_cold.isEmpty()) {
                        item { EmptySectionCard(stringResource(R.string.my_day_empty_going_cold)) }
                    } else {
                        items(d.going_cold, key = { it.lead_id }) { ColdLeadRow(it, onCall) }
                    }
                }
                item { Spacer(Modifier.height(8.dp)) }
                item {
                    TextButton(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { refreshing = true; fetch(isRefresh = true) },
                        enabled = !refreshing,
                    ) { Text(stringResource(R.string.my_day_refresh)) }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Rewrite the two row composables on `LeadRow`**

```kotlin
@Composable
private fun FollowUpRow(item: MyDayFollowUp, onCall: (String) -> Unit) {
    val context = LocalContext.current
    val overdue = item.status == "overdue"
    val dueLabel = remember(item.due_at) { formatIsoToLocal(context, item.due_at) }
    LeadRow(
        name = item.lead_name ?: stringResource(R.string.my_day_unknown_lead),
        subtitle = item.title.ifBlank { null },
        chipText = stringResource(
            if (overdue) R.string.my_day_overdue_at else R.string.my_day_due_at, dueLabel,
        ),
        tone = if (overdue) LeadTone.Overdue else LeadTone.Neutral,
        onCall = item.phone?.let { p -> { onCall(p) } },
    )
}

@Composable
private fun ColdLeadRow(item: MyDayColdLead, onCall: (String) -> Unit) {
    LeadRow(
        name = item.lead_name,
        subtitle = item.company,
        chipText = stringResource(R.string.my_day_cold_days, item.days_since_contact),
        tone = LeadTone.Cold,
        onCall = item.phone?.let { p -> { onCall(p) } },
    )
}
```

`EmptySectionCard` and `formatIsoToLocal` stay exactly as they are.

- [ ] **Step 4: Build and check on the emulator**

```bash
./gradlew :app:installDebug
```

Expected: two tabs with true totals, coloured edge stripes (red for overdue,
teal for cold), round orange call buttons, and a refresh control at the end of
the list.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/cloud/pyramedia/calls/ui/MyDayScreen.kt \
        app/src/main/res/values/strings.xml
git commit -m "feat(app): my-day gets tabs, coloured rows and a refresh

Overdue, due and cold leads shared one scroll, so reaching the cold list
meant paging past twenty follow-ups. They are now two tabs carrying the
endpoint's true totals.

Two tabs, not the three the design asks for: counts.follow_ups merges
overdue and pending, and counting the returned rows is wrong because they
are capped at 20. Showing a coarser true number beats showing a precise
wrong one; the split lands with the server count in wave C.

The row is now the shared LeadRow, so its edge stripe encodes state without
being read - red for overdue, teal for going cold."
```

---

## Task 9: Call-outcome and quick-add screens (B-02)

**Files:**
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/CallOutcomeActivity.kt:81-162`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/QuickAddActivity.kt:72-161`
- Modify: `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `PyraScreen`, `PyraChip` (Tasks 3-4).

- [ ] **Step 1: Add the string**

```xml
    <string name="co_lead_eyebrow">خلّصت مكالمة مع</string>
```

- [ ] **Step 2: Rewrite the call-outcome layout**

Replace the `Column(Modifier.fillMaxSize().padding(24.dp)) { … }` block
(lines 81-162) with the following. **All state, validation and submit logic
above and inside `onClick` is unchanged** — only the layout wrapper, the chip
rows and the button placement change.

```kotlin
                    PyraScreen(
                        title = stringResource(R.string.co_title),
                        bottomBar = {
                            Button(
                                enabled = !saving,
                                modifier = Modifier.fillMaxWidth(),
                                onClick = { /* UNCHANGED — copy the existing onClick body verbatim */ },
                            ) { Text(stringResource(if (saving) R.string.co_saving else R.string.co_save)) }
                        },
                    ) {
                        Card(
                            Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = LocalPyraColors.current.noticeContainer,
                            ),
                        ) {
                            Column(Modifier.padding(16.dp)) {
                                Text(
                                    stringResource(R.string.co_lead_eyebrow),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = LocalPyraColors.current.onNoticeContainer,
                                )
                                Text(
                                    leadName.ifBlank { unknownLead },
                                    style = MaterialTheme.typography.titleLarge,
                                )
                            }
                        }

                        Text(
                            stringResource(R.string.co_outcome_required),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        // FlowRow, not Row — three chips in a plain Row clipped
                        // «يحتاج إعادة اتصال» off screen at larger system font
                        // sizes (B-02).
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OUTCOME_OPTIONS.forEachIndexed { index, opt ->
                                PyraChip(
                                    label = stringResource(opt.labelRes),
                                    selected = outcomeIndex == index,
                                    onClick = { outcomeIndex = index },
                                )
                            }
                        }

                        OutlinedTextField(
                            value = note, onValueChange = { note = it },
                            label = { Text(stringResource(R.string.co_note_label)) },
                            modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4,
                        )

                        Text(
                            stringResource(R.string.co_follow_up_label),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FOLLOW_UP_PRESETS.forEach { preset ->
                                PyraChip(
                                    label = stringResource(preset.labelRes),
                                    selected = presetDays == preset.days,
                                    onClick = {
                                        presetDays = if (presetDays == preset.days) null else preset.days
                                    },
                                )
                            }
                        }

                        error?.let {
                            Text(it, color = MaterialTheme.colorScheme.error)
                        }
                    }
```

Copy the existing `onClick` body verbatim into the `bottomBar` button — do not
rewrite it. It contains the `outcomeIndex == null` guard, the
`DubaiTime.followUpPresetMillis` call, the `ApiResult` branches, the
`Notifier.cancel`, the `ErrorQueue.enqueue` and the `follow_up_error` toast
selection, and every one of those is load-bearing.

Add imports: `androidx.compose.foundation.layout.FlowRow`,
`androidx.compose.foundation.layout.ExperimentalLayoutApi`,
`cloud.pyramedia.calls.ui.components.PyraScreen`,
`cloud.pyramedia.calls.ui.components.PyraChip`,
`cloud.pyramedia.calls.ui.theme.LocalPyraColors`. Add
`@OptIn(ExperimentalLayoutApi::class)` alongside the existing
`@OptIn(ExperimentalMaterial3Api::class)`.

- [ ] **Step 3: Rewrite the quick-add layout**

Same treatment for `QuickAddActivity.kt` lines 72-161: wrap in `PyraScreen`
with `title = stringResource(R.string.qa_title)`, move the save `Button` into
`bottomBar` with its `onClick` body copied verbatim, and swap the two
`FilterChip`s for `PyraChip` inside a `FlowRow`. The phone line, the name and
company fields, and the entire `ExposedDropdownMenuBox` source picker stay
exactly as they are.

- [ ] **Step 4: Build and verify the clipping fix**

```bash
./gradlew :app:installDebug
```

On the emulator set Settings → Display → Font size to the **largest** step,
then trigger `CallOutcomeActivity`. Note `am start` cannot launch it — it is
`android:exported="false"` — so simulate a matched call and sync so the
notification appears, then tap it.

Expected: the three outcome chips wrap onto two lines, nothing is clipped, and
the save button is visible without scrolling.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/cloud/pyramedia/calls/ui/CallOutcomeActivity.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/QuickAddActivity.kt \
        app/src/main/res/values/strings.xml
git commit -m "fix(app): outcome and quick-add chips wrap instead of clipping

Three chips in a plain Row pushed «يحتاج إعادة اتصال» off screen at larger
system font sizes, which is a common setting - so the rep could not pick the
outcome that schedules a callback. FlowRow wraps them.

Both screens move to PyraScreen with the submit button in the bottom bar, so
it stays on screen instead of below the fold. Every line of submit logic,
validation and error handling is copied verbatim: this is a presentation
change only."
```

---

## Task 10: Login, permissions, update and update-required screens (U-08, U-09, B-09)

**Files:**
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/LoginScreen.kt:30-72`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/PermissionsScreen.kt:155-197`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/UpdateActivity.kt:82-230`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/UpdateRequiredScreen.kt`
- Modify: `app/src/main/java/cloud/pyramedia/calls/data/ApiClient.kt` (no change — listed for clarity: `appVersion()` already returns `release_notes`)
- Modify: `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `PyraScreen` (Task 3), `NoticeCard` (Task 4),
  `AppVersionInfo.release_notes` (existing, currently unused).

- [ ] **Step 1: Add the strings**

```xml
    <string name="login_app_name">Pyra Calls</string>
    <string name="update_version_label">الإصدار %1$s</string>
    <string name="update_size_label">حجم التحميل %1$s</string>
    <string name="update_notes_label">إيه الجديد</string>
    <string name="update_close">لاحقًا</string>
    <string name="cd_app_logo">شعار بيراميديا</string>
```

- [ ] **Step 2: Login screen — give it an identity**

Wrap in `PyraScreen` and add the mark above the title. Replace lines 30-37:

```kotlin
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.login_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.login_subtitle), style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(24.dp))
```

with:

```kotlin
    PyraScreen {
        Spacer(Modifier.height(48.dp))
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.drawable.ic_launcher_foreground),
                contentDescription = stringResource(R.string.cd_app_logo),
                modifier = Modifier
                    .size(88.dp)
                    .clip(MaterialTheme.shapes.large)
                    .background(MaterialTheme.colorScheme.primary),
            )
            Spacer(Modifier.height(12.dp))
            Text(
                stringResource(R.string.login_app_name),
                style = MaterialTheme.typography.titleLarge,
            )
            Spacer(Modifier.height(28.dp))
            Text(stringResource(R.string.login_title), style = MaterialTheme.typography.headlineSmall)
            Text(
                stringResource(R.string.login_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(24.dp))
```

Close the `PyraScreen` lambda where the old `Column` closed. The two
`OutlinedTextField`s, the `error?.let` and the submit `Button` (with its full
`onClick`) stay unchanged.

- [ ] **Step 3: Permissions screen — swap the hand-rolled card**

Replace lines 171-196 (the `if (hibernationRestricted) { Card(…) }` block)
with:

```kotlin
        if (hibernationRestricted) {
            Spacer(Modifier.height(24.dp))
            NoticeCard(
                title = stringResource(R.string.hibernation_title),
                body = stringResource(R.string.hibernation_body),
                action = { HibernationExemptionButton() },
            )
        }
```

and wrap the outer `Column` (lines 155-159) in `PyraScreen { … }`, keeping the
`horizontalAlignment` on an inner `Column`.

- [ ] **Step 4: Update screen — show what the rep is being asked to install**

`appVersion()` already returns `release_notes` and `UpdateActivity` throws it
away. Fetch the descriptor on entry and render it.

Add to `UpdateScreen`, just below the existing `state` declaration:

```kotlin
    var info by remember { mutableStateOf<AppVersionInfo?>(null) }
    var sizeBytes by remember { mutableStateOf<Long?>(null) }

    LaunchedEffect(Unit) {
        val v = withContext(Dispatchers.IO) { api.appVersion() }
        if (v is ApiResult.Ok) info = v.data.latest
        val d = withContext(Dispatchers.IO) { api.appDownload() }
        if (d is ApiResult.Ok) sizeBytes = d.data.size_bytes
    }
```

Replace the header (lines 192-193) with:

```kotlin
        Text(stringResource(R.string.update_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        info?.let { latest ->
            Text(
                stringResource(R.string.update_version_label, latest.version_name),
                style = MaterialTheme.typography.bodyMedium,
            )
            sizeBytes?.let { bytes ->
                Text(
                    stringResource(
                        R.string.update_size_label,
                        String.format(Locale.US, "%.1f MB", bytes / 1_048_576.0),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!latest.release_notes.isNullOrBlank()) {
                Spacer(Modifier.height(14.dp))
                Text(
                    stringResource(R.string.update_notes_label),
                    style = MaterialTheme.typography.labelLarge,
                )
                Spacer(Modifier.height(4.dp))
                Text(latest.release_notes, style = MaterialTheme.typography.bodyMedium)
            }
        }
        Spacer(Modifier.height(24.dp))
```

Wrap the whole thing in `PyraScreen` and give it a way out. In
`UpdateActivity.onCreate`:

```kotlin
        setContent {
            PyraTheme {
                UpdateScreen(api, onClose = { finish() })
            }
        }
```

and change the signature to
`private fun UpdateScreen(api: ApiClient, onClose: () -> Unit)`, wrapping the
body in:

```kotlin
    PyraScreen(
        title = stringResource(R.string.update_title),
        onBack = onClose,
    ) { … }
```

Drop the now-duplicated `Text(stringResource(R.string.update_title), …)` from
the body since the shell renders it.

Add imports `cloud.pyramedia.calls.core.AppVersionInfo`, `java.util.Locale`,
`androidx.compose.runtime.LaunchedEffect`.

**Do not add a close action to `UpdateRequiredScreen`** — that screen is a
deliberate block and its `BackHandler` is load-bearing. It gets the theme only.

- [ ] **Step 5: Build and check**

```bash
./gradlew :app:installDebug
```

Expected: login shows the orange mark and app name; the update screen shows a
version number, a download size and release notes, with a «لاحقًا» back action.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/cloud/pyramedia/calls/ui/LoginScreen.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/PermissionsScreen.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/UpdateActivity.kt \
        app/src/main/java/cloud/pyramedia/calls/ui/UpdateRequiredScreen.kt \
        app/src/main/res/values/strings.xml
git commit -m "feat(app): identity on login, and tell the rep what an update contains

Login was two lines of text and two fields - the first screen a new rep ever
sees, with nothing on it saying this is the company's app. It now carries the
mark and the app name.

The update screen asked for an install while showing neither the version nor
the size nor what changed: appVersion() has always returned release_notes and
the app parsed them and dropped them on the floor. All three are now shown,
and there is a way out of the screen.

UpdateRequiredScreen deliberately keeps no exit - its BackHandler is the
point. It takes the theme and nothing else."
```

---

## Task 11: Device acceptance and release

**Files:**
- Modify: `docs/CALL-TRACKING-BACKLOG.md` (close the 16 items)
- Modify: `pyra-calls-app/app/build.gradle.kts:30-31` (version bump)

- [ ] **Step 1: Full check**

```bash
cd pyra-calls-app
./gradlew :app:testDebugUnitTest :app:assembleRelease
ls -l app/build/outputs/apk/release/app-release.apk
```

Expected: all unit tests pass; APK **under 10,485,760 bytes**.

- [ ] **Step 2: Emulator acceptance sweep**

For **each** of the eight screens (permissions, login, home, my-day,
quick-add, call-outcome, update, update-required):

| Check | Pass condition |
|---|---|
| Default font, portrait | Renders, nothing clipped |
| **Largest system font** (Settings → Display → Font size → max) | **Every control reachable by scrolling; submit buttons visible** |
| Landscape | Same |
| Dark theme | Text readable, no bright-yellow cards |
| Long Arabic string | Letters stay joined — no stretched gaps between them |

The largest-font check on call-outcome is the acceptance test for B-01 and
B-02. If the save button cannot be reached, the wave is not done.

- [ ] **Step 3: Bump the version**

In `app/build.gradle.kts`:

```kotlin
        versionCode = 7
        versionName = "1.6.0"
```

- [ ] **Step 4: Real-device verification on cosette's handset**

Read the shipping rules at the end of
[`docs/CALL-TRACKING-BACKLOG.md`](../../CALL-TRACKING-BACKLOG.md) first.

```bash
./gradlew :app:assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

- **`install -r`, never uninstall.** An uninstall wipes `device_id`, and the
  phone's calls from today re-ingest under fresh `device_call_key`s as real
  duplicate rows in `pyra_agent_calls`.
- Log in as **`cosette`** (account is `active`, her old key is
  `is_active=false`, so this mints a fresh key and touches youssef's phone not
  at all). **Never log in as `youssef`.**
- Place one test call to **a number that is not any lead** — a matched number
  writes a real `call_logged`/`call_attempt` activity and moves the lead's
  `last_contact_at`.
- Confirm: the launcher icon, the notification's status-bar icon, the matched-
  call notification, and that Home's call count matches
  `/dashboard/crm/calls` for cosette (allowing for sync lag).

- [ ] **Step 5: Close the backlog items**

In `docs/CALL-TRACKING-BACKLOG.md`, change **الحالة** to `اتقفل v1.6.0` for:
B-01, B-02, B-07, B-08, B-09, U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-08,
U-09, U-10, F-05. Update the header's «الإصدار الحي» line.

- [ ] **Step 6: Ship — server first**

The wave has no server change, so there is nothing to deploy ahead of it. Merge
to `origin/main` anyway so the docs land, let Coolify finish, then:

```bash
pnpm app:publish --app pyra-calls
```

**Do not pass `--mandatory`.** v1.5.0 shipped non-mandatory deliberately —
habituating the rep to a block destroys its value, and this is a cosmetic
release.

- [ ] **Step 7: Commit**

```bash
git add pyra-calls-app/app/build.gradle.kts docs/CALL-TRACKING-BACKLOG.md
git commit -m "chore(app): v1.6.0 - UI foundation wave

Closes 16 backlog items: B-01 B-02 B-07 B-08 B-09 U-01 U-02 U-03 U-04 U-05
U-06 U-07 U-08 U-09 U-10 F-05.

Published non-mandatory, as v1.5.0 was. This is a presentation release; no
sync, notification or update behaviour changed."
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: §3 architecture →
Tasks 3-4 · §4 colours → Task 2 · §5 font → Tasks 1-2 · §6 icon → Task 6 ·
§7 screens → Tasks 7-10 · §8 B-07 → Task 5 · §9 error handling → Task 7's
`WorkState` and Task 8's retry · §10 testing → Tasks 2, 5, 11. Spec §9.1
(B-11) is explicitly wave C and correctly has no task here.

**Naming consistency check.** `CallLogFilter.isSyncable` / `isConnected` and
`CallCounts(total, connected)` are defined in Task 5 and used with those exact
names in Tasks 5 and 7. `PyraScreen` / `PyraListScreen` signatures in Task 3
match every call site in Tasks 7-10. `LeadTone.Overdue|Cold|Neutral` defined in
Task 4, used in Task 8. `LocalPyraColors.current` fields (`brandAccent`,
`danger`, `cool`, `noticeContainer`, `onNoticeContainer`) defined in Task 2 and
used in Tasks 4, 7, 9.

**Placeholder scan.** No `TBD`, no "add appropriate error handling", no
"similar to Task N". Every code step carries the code. The one genuine
unknown — whether the font fits the APK budget — is Task 1, an explicit gate
with three ordered fallbacks and a hard "do not proceed" instruction, not a
placeholder.

**Two things a reviewer should know are deliberate, not oversights:**

1. **My-day ships two tabs, not the three the design shows.** The overdue
   split needs a server count that does not exist yet (B-10). Counting the
   returned rows would be wrong — they are capped at 20. A coarser true number
   beats a precise false one.
2. **The call-outcome screen will be touched again in wave C**, when the
   reason prompt, the stage move and the follow-up close land. That second
   touch is additive on a finished layout, not a rewrite — cheaper than
   blocking this whole wave on server work.
