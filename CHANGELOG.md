# Change Log

All notable changes to the "toml-hilighter" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.4.0] - 2025-06-07

### Added

-   **JSON Schema-based Autocompletion (MVP):**
    -   Provides autocompletion for TOML keys based on the `properties` defined in the associated JSON schema.
    -   Suggests `enum` values from the schema when typing a value for a key with an enum definition.
    -   Suggests `true` and `false` for keys with a boolean type in the schema.
    -   Completions include `description` (as documentation) and `type` (as detail) from the schema.
    -   Uses existing schema loading and caching mechanisms.
    -   Context analysis for determining current TOML path is basic (primarily based on preceding `[table]` definitions and current line key prefixes).
    -   New configuration setting: `toml.schema.enableCompletions` (boolean, default: `true`) to toggle this feature.
-   Introduced a separate cache for raw (uncompiled) JSON schema objects to support traversal for completion suggestions.

### Changed
-   Renamed `clearSchemaCache` to `clearSchemaCaches` to reflect it clears both raw and compiled schema caches.
-   Refined schema loading to cache both raw and compiled schema objects.

## [0.3.2] - 2025-06-06

### Fixed
- Schema validation: Add `ajv-formats` to correctly handle standard JSON schema formats like "email".
- Schema validation: Improved logging for schema loading and validation errors.
- Schema validation: Set Ajv to `strict: true` for more robust schema compliance checks.
- Schema validation: Enhanced error message for missing required properties to be more specific.
- Schema validation: Refined glob pattern matching for `toml.schema.associations`.
- Schema validation: Resolved `TypeError: Do not know how to serialize a BigInt` by parsing TOML integers as standard numbers when preparing data for Ajv and `JSON.stringify` logging.

## [0.3.1] - 2025-06-05 (Internal - Corrected by 0.3.2)
- Add `ajv-formats` dependency to handle formats like "email" in JSON Schemas.

## [0.3.0] - 2025-06-05

### Added

-   **JSON Schema Validation:**
    -   Integrates `ajv` for validating TOML documents against JSON Schemas.
    -   Supports schema association via:
        -   `# $schema: <uri>` comment in TOML files (takes precedence).
        -   `toml.schema.associations` VS Code setting for glob pattern to schema URI mapping.
    -   Loads schemas from local file paths (relative and absolute) and HTTP/HTTPS URLs.
    -   Implements an in-memory cache for loaded and compiled schemas to improve performance.
    -   Reports schema validation errors as diagnostics in the "Problems" panel. (MVP: errors point to schema definition line or first line of document).
    -   New configuration settings:
        -   `toml.schema.enableValidation`: Toggle schema validation (default: `true`).
        -   `toml.schema.associations`: Define custom schema associations.
        -   `toml.schema.cache.maxSize`: Configure schema cache size (default: `20`).
    -   Adds a "TOML Schemas" output channel for logging schema loading and validation activity.

### Changed

-   Updated extension display name and description to include "Schema Support".
-   Dependencies: Added `ajv` for JSON schema validation.

### Fixed

-   More robust handling of TOML parsing errors when error location is out of document bounds.

## [0.2.0] - 2025-04-23

### Added

-   **Real-time TOML syntax validation:** Uses `@ltd/j-toml` parser to detect and report TOML v1.0.0 syntax errors inline and in the Problems panel.

### Changed

-   Updated extension display name and description to include "Validation".

### Fixed

-   Accurate reporting of error locations (line and approximate column) for validation messages by parsing parser output.

## [0.1.0] - 2025-04-23

### Added

-   Initial release of the TOML Highlighting extension.
-   Comprehensive syntax highlighting for TOML v1.0.0 features:
    -   Keys (Bare, Quoted)
    -   Strings (Basic, Multiline, Literal)
    -   Numbers (Integers - Dec, Hex, Oct, Bin; Floats - incl. Inf/NaN)
    -   Booleans (`true`, `false`)
    -   Dates and Times (Offset, Local Date/Time/Date-Time)
    -   Arrays (`[...]`)
    -   Inline Tables (`{...}`)
    -   Tables (`[...]`)
    -   Arrays of Tables (`[[...]]`)
    -   Comments (`#`)
-   Language configuration for bracket matching, auto-closing pairs, and commenting.
-   Support for `.toml` and `.pip` file extensions.
-   Default color customizations for table headers and keys (configurable).
-   MIT License.