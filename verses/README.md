# Sanskrit Karaoke Verse Library

This directory contains the file-based catalogue for Sanskrit Karaoke verses.

## File Structure

- `schema/verse.schema.json`: JSON Schema (draft-07) defining the standard structure of a single verse file.
- `data/*.json`: Individual verse files (e.g., `bhg_2_47.json`).
- `index.json`: Auto-generated catalogue of all verses (light metadata only). Do not edit manually.

## Schema Fields Documentation

The `verse.schema.json` file requires several fields. Here is the documentation for all fields.

### Identity
- **`id`** (string, required): Slug, alphanumeric with underscores. Example: `"bhg_2_47"`
- **`version`** (integer, required): Schema or content version. Example: `1`

### Content
- **`title`** (object, required): Localised titles.
  - **`ru`** (string, required): Russian title. Example: `"Бхагавад-гита 2.47"`
  - **`en`** (string, optional): English title. Example: `"Bhagavad Gita 2.47"`
- **`source`** (object, optional):
  - **`text`** (string): Scripture name. Example: `"Bhagavad Gita"`
  - **`chapter`** (integer): Chapter number. Example: `2`
  - **`verse`** (integer): Verse number. Example: `47`
- **`translation`** (object, optional):
  - **`ru`** (string): Russian translation. Example: `"Твое право лишь в действии..."`
  - **`en`** (string): English translation. Example: `"You have a right to perform..."`

### Learning
- **`meter`** (string, required): Poetic meter. Example: `"anushtubh"`
- **`difficulty`** (integer, required): 1 (beginner) to 5 (advanced). Example: `1`
- **`language_tags`** (array of strings, optional): Languages available. Enum: `["ru", "en"]`. Example: `["ru", "en"]`
- **`tags`** (array of strings, optional): Categorization tags. Example: `["bhagavad-gita", "beginner"]`

### Authoring & Text
- **`author`** (object, optional):
  - **`melody`** (string): Melody author/style. Example: `"Traditional"`
  - **`transcription`** (string): Transcriber. Example: `"Mārcis Gasūns"`
- **`encoding`** (string, required): Text encoding format. Enum: `["DEV", "IAST", "SLP1", "HK", "ITRANS", "VH", "WX"]`. Example: `"DEV"`
- **`s1`** (string, required): First half-verse input text. Example: `"कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।"`
- **`s2`** (string, required): Second half-verse input text. Example: `"मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥"`
- **`s1dev`** (string, optional): Devanagari for s1 (optional if encoding=DEV).
- **`s2dev`** (string, optional): Devanagari for s2.

### Assets & Timestamps
- **`audio`** (object, optional):
  - **`drive_file_id`** (string): Google Drive file ID of the audio. Example: `"1A2B3C4D5E6F7G8H9I0J"`
  - **`duration_s`** (number): Audio length in seconds. Example: `15.5`
- **`session`** (object, optional): Saved app session (timing, positions).
  - **`drive_file_id`** (string): Google Drive file ID of the session JSON.
  - **`created_at`** (string, date format): Date session was created.
- **`created_at`** (string, date format, required): Example: `"2026-05-12"`
- **`updated_at`** (string, date format, optional): Example: `"2026-05-12"`

## Validation and Building Index
To validate files:
```bash
python tools/validate_library.py
```

To build index:
```bash
python tools/build_index.py
```
