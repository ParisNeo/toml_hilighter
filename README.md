# TOML Highlighting, Validation & Schema Support for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/ParisNeo.toml-hilighter?style=flat-square&label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=ParisNeo.toml-hilighter)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/ParisNeo.toml-hilighter?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=ParisNeo.toml-hilighter)
[![Visual Studio Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/ParisNeo.toml-hilighter?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=ParisNeo.toml-hilighter)

Comprehensive syntax highlighting, **TOML v1.0.0 syntax validation**, and **JSON Schema based validation** for TOML (Tom's Obvious, Minimal Language) files in Visual Studio Code.

![TOML Highlighting & Validation Demo](images/demo.gif)
*(Animation placeholder - You need to create/update `images/demo.gif` to show highlighting, syntax validation, and schema validation)*

This extension provides detailed syntax highlighting for all TOML v1.0.0 features, adds real-time TOML syntax validation, and introduces JSON Schema based validation to catch structural and content errors, making your configuration files easier to read, write, and debug.

## Features

*   **Full TOML v1.0.0 Syntax Highlighting:** Highlights keys (bare, quoted), strings (basic, multiline, literal), integers (decimal, hex, octal, binary), floats (including inf/nan), booleans, dates and times (offset, local), arrays, inline tables, standard tables, and arrays of tables.
*   **Real-time TOML Syntax Validation:** Detects TOML syntax errors as you type, providing inline diagnostics (squiggles) and detailed error messages in the 'Problems' panel (powered by [`@ltd/j-toml`](https://github.com/LongTengDao/j-toml)).
*   **JSON Schema Validation:**
    *   Validates TOML documents against specified JSON Schemas.
    *   Associate schemas using:
        *   `# $schema: <uri>` comment within the TOML file (e.g., `# $schema: ./my-config.schema.json`).
        *   `toml.schema.associations` setting in your VS Code `settings.json` to map file glob patterns to schema URIs.
    *   Loads schemas from local files (relative or absolute paths) and remote HTTP/HTTPS URLs.
    *   Caches compiled schemas for improved performance.
    *   Reports schema violations as diagnostics in the "Problems" panel.
    *   Includes a "TOML Schemas" output channel for debugging schema loading and validation.
*   **Comments:** Clear highlighting for comments.
*   **Operators:** Distinguishes the assignment operator (`=`).
*   **Structure:** Properly scopes tables (`[...]`), arrays of tables (`[[...]]`), arrays (`[...]`), and inline tables (`{...}`).
*   **Language Configuration:** Includes bracket matching, auto-closing pairs, commenting (`#`), and word patterns suitable for TOML.
*   **Color Theme Integration:** Uses standard TextMate scopes for highlighting compatibility with most VS Code color themes.
*   **Customizable Colors:** Provides default color overrides for table headers and keys, easily adjustable in your `settings.json` (see `package.json` `configurationDefaults`).

## Installation

1.  Open **Visual Studio Code**.
2.  Go to the **Extensions** view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3.  Search for `TOML Highlighting ParisNeo`.
4.  Click **Install**.
5.  Reload VS Code if prompted.

Alternatively, install via the command line:
```bash
code --install-extension ParisNeo.toml-hilighter
```

## Usage

The extension automatically activates when you open a file with the `.toml` extension. Syntax highlighting is applied immediately.

*   **Syntax Errors:** Will be underlined, and details will appear in the "Problems" view (`Ctrl+Shift+M` or `Cmd+Shift+M`).
*   **Schema Validation:** If a schema is associated (see below), validation will occur after successful syntax parsing. Schema errors will also appear in the "Problems" view.

### Associating JSON Schemas

You can associate a JSON schema with your TOML files in two ways:

1.  **In-file `$schema` comment (Recommended for project-specific schemas):**
    Add a comment at the top of your TOML file:
    ```toml
    # $schema: ./path/to/your/schema.json
    # or
    # $schema: https://example.com/remote/schema.json

    title = "My TOML Configuration"
    # ... rest of your TOML content
    ```
    Relative paths are resolved against the location of the TOML file. This method takes precedence over settings-based associations.

2.  **VS Code Settings (`toml.schema.associations`):**
    Configure associations in your `settings.json` (`Ctrl+,` or `Cmd+,`):
    ```json
    "toml.schema.associations": {
        "**/my-project-config.toml": "./schemas/project-specific.json",
        "**/another-pattern/*.toml": "https://json.schemastore.org/cargo", // Example: Cargo.toml
        "/Users/me/global_configs/**/conf.toml": "/absolute/path/to/global_schema.json"
    }
    ```
    The key is a glob pattern that matches TOML file paths, and the value is the schema URI (local path relative to the workspace root, absolute path, or an HTTPS URL).

### Schema Validation Notes

*   Schema validation is performed *after* the TOML file is successfully parsed for syntax. If there are TOML syntax errors, schema validation will not run for that document.
*   For the initial implementation, schema validation errors from `ajv` include an `instancePath` (e.g., `/section/key`). Diagnostics are placed on the line of the `# $schema` comment if one is used, or on the first line of the document otherwise. The diagnostic message will contain the `instancePath` and the error message from `ajv` to help you locate the issue.
*   The "TOML Schemas" output channel (`View > Output`, then select "TOML Schemas" from the dropdown) provides logs related to schema loading, caching, and errors, which can be helpful for troubleshooting.

## Configuration

This extension offers the following settings (accessible via `settings.json`):

*   `toml.schema.enableValidation` (boolean, default: `true`):
    Enable or disable JSON Schema validation for TOML files.
*   `toml.schema.associations` (object, default: `{}`):
    Associate TOML files matching glob patterns with JSON Schemas.
    Example: `{ "**/mypackage.toml": "./schemas/mypackage.schema.json" }`
*   `toml.schema.cache.maxSize` (integer, default: `20`):
    Maximum number of compiled schemas to keep in the cache. Set to `0` to disable caching (not recommended for remote schemas).

## Customization (Highlighting)

You can customize the syntax highlighting colors by targeting the TextMate scopes used in this extension within your VS Code `settings.json`. The default customizations provide examples:

```json
"editor.tokenColorCustomizations": {
    "[toml]": { // Apply only to TOML files
        "textMateRules": [
            {
                "name": "TOML Sections (User Override)",
                "scope": [
                    "entity.name.section.table.toml",
                    "entity.name.section.array.table.toml",
                    "punctuation.definition.table.begin.toml",
                    "punctuation.definition.table.end.toml",
                    "punctuation.definition.table.array.begin.toml",
                    "punctuation.definition.table.array.end.toml",
                    "entity.name.section.key.quoted.toml"
                 ],
                "settings": {
                    "foreground": "#C586C0" // Example: Change table headers to pink
                }
            },
            {
                "name": "TOML Keys (User Override)",
                "scope": [
                   "variable.other.key.toml" // For bare keys
                   // For quoted keys, you might need more specific selectors if default string scopes interfere
                   // e.g., "meta.key-value.pair.toml string.quoted.double.key.toml" if you define such specific scopes
                ],
                "settings": {
                   "foreground": "#9CDCFE" // Example: Change keys to light blue
                }
            }
            // Add more rules here to customize other scopes...
        ]
    }
}
```

Refer to the `syntaxes/toml.tmLanguage.json` file for a full list of scopes used for highlighting. *(Note: Validation appearance is generally controlled by theme settings for errors/warnings).*

## Dependencies

*   [`@ltd/j-toml`](https://github.com/LongTengDao/j-toml): For parsing and validating TOML syntax.
*   [`ajv`](https://ajv.js.org/): For JSON Schema validation.

These dependencies are bundled with the extension.

## Contributing

Contributions, issues, and feature requests are welcome! Please check the [repository issues](https://github.com/ParisNeo/toml_hilighter/issues) page.

## License

This extension is licensed under the [MIT License](LICENSE).

---

**Enjoy clearer, more correct, and well-structured TOML files!**