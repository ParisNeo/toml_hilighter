# TOML Highlighting & Validation for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/ParisNeo.toml-hilighter?style=flat-square&label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=ParisNeo.toml-hilighter)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/ParisNeo.toml-hilighter?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=ParisNeo.toml-hilighter)
[![Visual Studio Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/ParisNeo.toml-hilighter?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=ParisNeo.toml-hilighter)

Comprehensive syntax highlighting **and validation** for TOML (Tom's Obvious, Minimal Language) files in Visual Studio Code.

![TOML Highlighting & Validation Demo](images/demo.gif)
*(Animation placeholder - You need to create/update `images/demo.gif` to show both highlighting and validation)*

This extension provides detailed syntax highlighting for all TOML v1.0.0 features and adds real-time validation to catch syntax errors, making your configuration files easier to read, write, and debug.

## Features

*   **Full TOML v1.0.0 Syntax Highlighting:** Highlights keys (bare, quoted), strings (basic, multiline, literal), integers (decimal, hex, octal, binary), floats (including inf/nan), booleans, dates and times (offset, local), arrays, inline tables, standard tables, and arrays of tables.
*   **Real-time Validation:** Detects TOML syntax errors as you type, providing inline diagnostics (squiggles) and detailed error messages in the 'Problems' panel (powered by [`@ltd/j-toml`](https://github.com/LongTengDao/j-toml)).
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

The extension automatically activates when you open a file with the `.toml` or `.pip` extension. Syntax highlighting is applied immediately. Syntax errors will be underlined, and details will appear in the "Problems" view (`Ctrl+Shift+M` or `Cmd+Shift+M`).

## Customization (Highlighting)

You can customize the syntax highlighting colors by targeting the TextMate scopes used in this extension within your VS Code `settings.json`. The default customizations provide examples:

```json
"editor.tokenColorCustomizations": {
    "[toml]": { // Apply only to TOML files
        "textMateRules": [
            {
                "name": "TOML Sections (User Override)",
                "scope": [
                    "meta.tag.table.toml entity.name.section.key",
                    "meta.tag.array.table.toml entity.name.section.key",
                    "punctuation.definition.table.begin.toml",
                    "punctuation.definition.table.end.toml",
                    "punctuation.definition.table.array.begin.toml",
                    "punctuation.definition.table.array.end.toml"
                 ],
                "settings": {
                    "foreground": "#C586C0" // Example: Change table headers to pink
                }
            },
            {
                "name": "TOML Keys (User Override)",
                "scope": [
                   "meta.key-value.pair.toml variable.other.key.toml",
                   "meta.key-value.pair.toml string.quoted.double.key.toml",
                   "meta.key-value.pair.toml string.quoted.single.key.toml"
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

This extension utilizes the [`@ltd/j-toml`](https://github.com/LongTengDao/j-toml) library for parsing and validating TOML files. This dependency is bundled with the extension during installation.

## Contributing

Contributions, issues, and feature requests are welcome! Please check the [repository issues](https://github.com/ParisNeo/toml_hilighter/issues) page.

## License

This extension is licensed under the [MIT License](LICENSE).

---

**Enjoy clearer and more correct TOML files!**