# Use Case Scenarios — Sanskrit Karaoke

This document outlines the primary workflows for different user roles within the Sanskrit Karaoke ecosystem.

---

## 1. The Content Creator (Teacher / Scholar)
**Goal:** Transform a raw Sanskrit text and an audio recording into a structured, interactive lesson for the library.

### Workflow:
1.  **Text Input:** Open `index.html`. Paste the first half-verse (s1) and second half-verse (s2). The tool automatically detects the meter and renders the initial Wave Diagram.
2.  **Audio Integration:** Load the `.mp3` or `.wav` recording.
3.  **Metrical Polish:** Right-click syllables to correct weights (Guru/Laghu) if the auto-detection missed a poetic nuance (e.g., *muta cum liquida*).
4.  **Timing Synchronization:**
    *   Open the **Timing Editor**.
    *   Use **Pada Mode** to drag the 8 padas boundaries.
    *   Switch to **Syllable Mode** to fine-tune the "dot" highlight for every syllable using keyboard shortcuts (`Ctrl+Arrows`).
5.  **Metadata & Export:**
    *   Fill in the **Library Export** form (add translations, difficulty level, and tags).
    *   Download the `[id].json` file and save it to `verses/data/`.
    *   Export a high-resolution **PNG** for printable handouts and a **Karaoke MP4** for social media.
6.  **Cloud Save:** Save the session to Google Drive to allow for future corrections.

---

## 2. The Active Learner (Student)
**Goal:** Systematically memorize a verse and master its metrical rhythm using spaced repetition.

### Workflow:
1.  **Discovery:** Browse `catalogue.html` (or open it via Telegram Mini App). Filter by "Difficulty: Easy" or "Meter: Anushtubh".
2.  **Study Session:**
    *   **Phase A (Full Mode):** Listen to the audio while watching the Wave labels to associate sounds with syllables.
    *   **Phase B (Dots Mode):** Hide the text. Follow the visual metrical pulse (Wave peaks) while chanting aloud.
    *   **Phase C (Blind Mode):** Everything is hidden except the moving highlight dot. Attempt total recall.
3.  **Self-Assessment:**
    *   Complete the **Rotating Quizzes** (identify the meter, fill in the hidden syllable, or beat-tap the rhythm).
    *   Rate the recall quality (😊/😐/😕).
4.  **Cloud Sync:** Sign in via the **Cloud Sync** button to ensure progress is saved to Firebase.

---

## 3. The Curator (Pipeline Operator / Engineer)
**Goal:** Maintain the quality of the verse library and monitor platform efficiency.

### Workflow:
1.  **Content Ingestion:** Review a Pull Request containing new verse JSONs.
2.  **Automated Validation:** The **Teaching Pipeline** runs:
    *   **VerseCurator** checks schema compliance.
    *   **ContentEnricher** (via Gemini) fills in missing Russian/English translations.
    *   **QualityGate** ensures the meter name matches the metrical structure.
3.  **Observability Check:**
    *   Run `python tools/cost_dashboard.py` to ensure the automated enrichment stayed under the **$0.10/verse** budget.
    *   Run `python tools/student_stats.py` to identify if any new verses are "Harder" than expected based on student fail rates.
4.  **Eval Benchmarking:** Run `python evals/judge.py` to ensure the LLM-based translations didn't regress after a pipeline change.

---

## 4. The Offline Practitioner (Mobile/Traveler)
**Goal:** Continue studying during a commute or in areas with poor connectivity.

### Workflow:
1.  **Preparation:** Load a verse once while online. The system automatically caches the session data.
2.  **Offline Use:** Open `student.html?id=[id]`. The browser's **Service Worker** serves the UI, and the **Drive Fallback** loads the session wave from local cache.
3.  **Indicator:** The header displays **"Offline Mode (Cached)"** to confirm local data usage.
4.  **Sync-Back:** When back online, the student visits `progress.html`, and their offline practice results are synced to the Firebase cloud.
