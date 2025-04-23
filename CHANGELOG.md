# Change Log

All notable changes to the "toml-hilighter" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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