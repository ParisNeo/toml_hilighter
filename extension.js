// extension.js
const vscode = require('vscode');
const TOML = require('@ltd/j-toml');

/** @type {vscode.DiagnosticCollection} */
let diagnosticCollection;

// Regular expression to extract line and column from j-toml error messages
// Example message: "Keys must equal something, but missing at line 97, column 1"
// Or: "Keys must equal something, but missing at line 97: ds" (assuming column is implied as 1 or start of issue)
const tomlErrorRegex = /at line (\d+)(?:, column (\d+))?/;

/**
 * Validates a TOML text document and updates diagnostics.
 * @param {vscode.TextDocument} document The document to validate.
 */
function validateTomlDocument(document) {
    if (document.languageId !== 'toml') {
        return;
    }

    const diagnostics = [];
    const text = document.getText();

    try {
        TOML.parse(text, 1.0, '\n');
    } catch (error) {
        let range;
        let message = `TOML Parse Error: ${error.message || 'Unknown error'}`;
        let severity = vscode.DiagnosticSeverity.Error;

        // Attempt to extract line/column from the error message string
        const match = message.match(tomlErrorRegex);
        let line = -1;
        let col = 0; // Default to column 0 (start of line) if not specified

        if (match) {
            // match[1] is the line number string, match[2] (optional) is the column string
            const parsedLine = parseInt(match[1], 10);
            if (!isNaN(parsedLine) && parsedLine >= 1) {
                line = parsedLine - 1; // Convert to 0-based
            }

            if (match[2]) {
                const parsedCol = parseInt(match[2], 10);
                 if (!isNaN(parsedCol) && parsedCol >= 1) {
                    col = parsedCol - 1; // Convert to 0-based
                 }
            }
        }

        // Now check if we have a valid line number
        if (line !== -1) {
            // Ensure the calculated line number is within the document bounds
            if (line < document.lineCount) {
                const lineText = document.lineAt(line).text;
                const startChar = Math.max(0, col); // Ensure column isn't negative
                const endChar = lineText.length; // Highlight to end of line

                // Calculate range based on extracted line/col
                range = new vscode.Range(line, startChar, line, endChar);

                 // Alternative: Highlight just one character at the reported column
                 // if (col >= 0) range = new vscode.Range(line, col, line, col + 1);
                 // else range = new vscode.Range(line, 0, line, 1); // Fallback if col parsing failed

                 // Alternative: Highlight the whole line
                 // range = new vscode.Range(line, 0, line, lineText.length);

            } else {
                 // Line number from error message is out of bounds
                 console.warn(`TOML parser reported error on line ${line + 1}, but document only has ${document.lineCount} lines.`);
                 range = new vscode.Range(0, 0, 0, 1); // Fallback to start of file
                 message += ` (Reported at line ${line + 1}${col >=0 ? ', col '+(col+1) : ''} - position might be inaccurate)`;
            }
        } else {
            // Could not extract line number from error message, report at start of file
            range = new vscode.Range(0, 0, 0, 1);
            console.error("TOML parsing error message lacks parsable location information:", error.message);
        }


        // Create and add the diagnostic
        if (range) {
            const diagnostic = new vscode.Diagnostic(range, message, severity);
            diagnostics.push(diagnostic);
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

// --- activate and deactivate functions remain the same ---

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "toml-hilighter" with validation is now active!');
    diagnosticCollection = vscode.languages.createDiagnosticCollection('toml');
    context.subscriptions.push(diagnosticCollection);
    vscode.workspace.textDocuments.forEach(validateTomlDocument);
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(validateTomlDocument));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => validateTomlDocument(event.document)));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri)));
}

function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.dispose();
    }
    console.log('Deactivated "toml-hilighter"');
}

module.exports = {
    activate,
    deactivate
}