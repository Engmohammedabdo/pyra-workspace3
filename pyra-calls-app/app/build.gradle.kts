import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Release signing — loaded from a private, out-of-repo properties file so the
// keystore + passwords never touch source control. When the file is absent
// (e.g. a fresh checkout on another machine), the release build type simply
// skips assigning a signingConfig and stays buildable (unsigned release APK
// via the default debug-like behavior of the Android Gradle Plugin — it will
// just not be installable as a signed release until the file is provided).
// See docs/CALL-TRACKING.md "Building & installing the APK" for setup.
val signingProps = Properties().apply {
    val f = file("C:/Users/engmo/pyra-keys/signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "cloud.pyramedia.calls"
    compileSdk = 36

    defaultConfig {
        applicationId = "cloud.pyramedia.calls"
        minSdk = 26
        targetSdk = 34
        versionCode = 3
        versionName = "1.2.1"
    }

    buildFeatures { compose = true; buildConfig = true }

    signingConfigs {
        if (signingProps.isNotEmpty()) {
            create("release") {
                storeFile = file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:3000\"")
            // E2E channel — keeps debug/test releases invisible to production
            // phones (which build against the "pyra-calls" channel below and
            // poll /api/mobile/app-version?app=pyra-calls every sync cycle).
            buildConfigField("String", "APP_CHANNEL", "\"pyra-calls-e2e\"")
        }
        release {
            buildConfigField("String", "BASE_URL", "\"https://workspace.pyramedia.cloud\"")
            buildConfigField("String", "APP_CHANNEL", "\"pyra-calls\"")
            isMinifyEnabled = false
            if (signingProps.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.security.crypto)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
}
