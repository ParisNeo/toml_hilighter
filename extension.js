// extension.js
console.log('[TOML Extension] File loaded by VS Code.'); // Top-level log

const vscode = require('vscode');
const TOML = require('@ltd/j-toml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const path = require('path');
const fs = require('fs').promises;
const { URL } = require('url');

/** @type {vscode.DiagnosticCollection} */
let diagnosticCollection;
let outputChannel;

// --- TOML Syntax Error Parsing ---
const tomlErrorRegex = /at line (\d+)(?:, column (\d+))?/;

// --- JSON Schema Constants and Variables ---
const SCHEMA_COMMENT_REGEX = /#\s*\$schema:\s*(\S+)/;
let ajv;
const schemaCache = new Map();
let maxSchemaCacheSize = 20;
let schemaValidationEnabled = true;

/**
 * Logs a message to the TOML Schemas output channel.
 * Also logs to console.log for early debugging.
 * @param {string} message
 */
function logToChannel(message) {
    console.log(`[TOML LOG]: ${message}`); // Also log to dev console
    if (outputChannel) {
        outputChannel.appendLine(message);
    } else {
        console.warn("[TOML LOG PRE-CHANNEL]: " + message); // Log if channel not yet ready
    }
}

/**
 * Manages the schema cache, adding a new schema and evicting the oldest if the cache exceeds maxSize.
 * @param {string} schemaUri The URI of the schema.
 * @param {import('ajv').ValidateFunction} compiledSchema The compiled schema function.
 */
function cacheSchema(schemaUri, compiledSchema) {
    if (maxSchemaCacheSize === 0) return; 

    if (schemaCache.size >= maxSchemaCacheSize && !schemaCache.has(schemaUri)) {
        const oldestKey = schemaCache.keys().next().value;
        if (oldestKey) {
            schemaCache.delete(oldestKey);
            logToChannel(`Cache full. Evicted schema: ${oldestKey}`);
        }
    }
    schemaCache.set(schemaUri, compiledSchema);
    logToChannel(`Cached schema: ${schemaUri}. Cache size: ${schemaCache.size}`);
}

/**
 * Clears the schema cache.
 */
function clearSchemaCache() {
    schemaCache.clear();
    logToChannel('Schema cache cleared.');
}

/**
 * Loads and compiles a JSON schema from a URI (file or HTTP/S).
 * @param {string} schemaUri The URI of the schema.
 * @param {vscode.Uri} documentUri The URI of the TOML document, for resolving relative paths.
 * @returns {Promise<import('ajv').ValidateFunction | null>} A promise that resolves to the compiled schema function or null.
 */
async function loadAndCompileSchema(schemaUri, documentUri) {
    logToChannel(`loadAndCompileSchema called for schema URI: "${schemaUri}", document: "${documentUri ? documentUri.fsPath : 'N/A'}"`);
    if (maxSchemaCacheSize > 0 && schemaCache.has(schemaUri)) {
        logToChannel(`Schema cache hit for: ${schemaUri}`);
        return schemaCache.get(schemaUri);
    }

    logToChannel(`Loading schema: ${schemaUri}`);
    let schemaContent;
    let absoluteSchemaUri = schemaUri;

    try {
        if (schemaUri.startsWith('http://') || schemaUri.startsWith('https://')) {
            logToChannel(`Fetching remote schema: ${schemaUri}`);
            const response = await fetch(schemaUri);
            if (!response.ok) {
                throw new Error(`Failed to fetch schema from ${schemaUri}. Status: ${response.status} ${response.statusText}`);
            }
            schemaContent = await response.text();
            logToChannel(`Remote schema content fetched for: ${schemaUri}`);
        } else {
            let resolvedUri;
            if (path.isAbsolute(schemaUri)) {
                resolvedUri = vscode.Uri.file(schemaUri);
                logToChannel(`Schema URI is absolute: ${resolvedUri.fsPath}`);
            } else {
                let baseUri = documentUri ? vscode.Uri.joinPath(documentUri, '..') : null;
                if (!baseUri && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    baseUri = vscode.workspace.workspaceFolders[0].uri;
                    logToChannel(`Using workspace folder as base for relative schema: ${baseUri.fsPath}`);
                }
                if (!baseUri) {
                    throw new Error(`Cannot resolve relative schema path "${schemaUri}" without an open document in a workspace or an absolute path.`);
                }
                resolvedUri = vscode.Uri.joinPath(baseUri, schemaUri);
                logToChannel(`Resolved relative schema path "${schemaUri}" to "${resolvedUri.fsPath}"`);
            }
            absoluteSchemaUri = resolvedUri.toString();
            schemaContent = await fs.readFile(resolvedUri.fsPath, 'utf-8');
            logToChannel(`Local schema content read for: ${resolvedUri.fsPath}`);
        }

        const schemaJson = JSON.parse(schemaContent);
        logToChannel(`Schema content parsed to JSON for: ${schemaUri}`);
        
        const compiledSchema = ajv.compile(schemaJson);
        logToChannel(`Schema compiled by Ajv for: ${schemaUri}`);
        
        if (maxSchemaCacheSize > 0) {
            cacheSchema(schemaUri, compiledSchema);
        }
        return compiledSchema;
    } catch (error) {
        logToChannel(`Error loading/compiling schema ${schemaUri} (resolved to ${absoluteSchemaUri}): ${error.message}. Ajv errors (if any): ${error.errors ? JSON.stringify(error.errors) : 'N/A'}`);
        vscode.window.showErrorMessage(`TOML: Failed to load/compile schema "${schemaUri}": ${error.message}`);
        return null;
    }
}

/**
 * Finds the schema URI for a given TOML document.
 * @param {vscode.TextDocument} document The document to find the schema for.
 * @returns {Promise<string | null>} The schema URI or null if not found.
 */
async function getSchemaForDocument(document) {
    logToChannel(`getSchemaForDocument for: ${document.uri.fsPath}`);
    const lineCountToCheck = Math.min(document.lineCount, 10);
    for (let i = 0; i < lineCountToCheck; i++) {
        const line = document.lineAt(i).text;
        const match = line.match(SCHEMA_COMMENT_REGEX);
        if (match && match[1]) {
            const schemaUriInFile = match[1].trim();
            logToChannel(`Found # $schema in file: ${schemaUriInFile}`);
            return schemaUriInFile;
        }
    }

    const associations = vscode.workspace.getConfiguration('toml').get('schema.associations');
    logToChannel(`Schema associations from settings: ${JSON.stringify(associations)}`);
    if (associations && typeof associations === 'object') {
        const docPath = document.uri.fsPath;
        for (const pattern in associations) {
            logToChannel(`Checking pattern "${pattern}" against "${docPath}"`);
            let rePatternText = pattern
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&') 
                .replace(/\*\*/g, '(.+[\\\\\\/])?')     
                .replace(/\*/g, '[^\\\\\\/]*');       
            
            try {
                const regex = new RegExp(`^${rePatternText}$`);
                if (regex.test(docPath)) {
                    const schemaUriFromConfig = associations[pattern];
                    logToChannel(`Schema association matched for ${docPath} via pattern "${pattern}": ${schemaUriFromConfig}`);
                    return schemaUriFromConfig;
                }
            } catch (e) {
                logToChannel(`Invalid glob pattern in toml.schema.associations: "${pattern}". Error: ${e.message}`);
            }
        }
    }
    logToChannel(`No schema association found for: ${document.uri.fsPath}`);
    return null;
}


/**
 * Validates a TOML text document and updates diagnostics.
 * @param {vscode.TextDocument} document The document to validate.
 */
async function validateTomlDocument(document) {
    logToChannel(`validateTomlDocument called for: "${document.uri.fsPath}"`);
    if (document.languageId !== 'toml') {
        logToChannel(`Document ${document.uri.fsPath} is not TOML, skipping validation.`);
        return;
    }

    const diagnostics = [];
    const text = document.getText();
    let parsedTomlData = null;

    // --- 1. Syntax Validation ---
    logToChannel(`Attempting TOML syntax validation for: "${document.uri.fsPath}"`);
    try {
        // Parse with useBigInt: false to ensure numbers are used, compatible with JSON.stringify and Ajv.
        // The third argument to TOML.parse is multilineStringJoiner, fourth is useBigInt.
        parsedTomlData = TOML.parse(text, 1.0, '\n', false); 
        logToChannel(`TOML syntax validation successful for: "${document.uri.fsPath}". Parsed data: ${JSON.stringify(parsedTomlData)}`);
    } catch (error) {
        logToChannel(`TOML syntax validation failed for: "${document.uri.fsPath}". Error: ${error.message}`);
        let range;
        let message = `TOML Syntax Error: ${error.message || 'Unknown error'}`;
        let severity = vscode.DiagnosticSeverity.Error;
        const match = message.match(tomlErrorRegex);
        let line = -1;
        let col = 0;

        if (match) {
            const parsedLine = parseInt(match[1], 10);
            if (!isNaN(parsedLine) && parsedLine >= 1) line = parsedLine - 1;
            if (match[2]) {
                const parsedCol = parseInt(match[2], 10);
                if (!isNaN(parsedCol) && parsedCol >= 1) col = parsedCol - 1;
            }
        }

        if (line !== -1 && line < document.lineCount) {
            const lineText = document.lineAt(line).text;
            const startChar = Math.max(0, col);
            const endChar = Math.max(startChar + 1, lineText.length);
            range = new vscode.Range(line, startChar, line, endChar);
        } else {
            range = new vscode.Range(0, 0, 0, 1);
            if (line !== -1) message += ` (Reported at line ${line + 1}${col >=0 ? ', col '+(col+1) : ''} - pos out of bounds)`;
            logToChannel(`TOML parser error position potentially out of bounds: ${message}`);
        }
        const diagnostic = new vscode.Diagnostic(range, message, severity);
        diagnostic.source = 'toml-syntax';
        diagnostics.push(diagnostic);
    }

    // --- 2. Schema Validation (only if syntax is valid and enabled) ---
    if (parsedTomlData && schemaValidationEnabled) {
        logToChannel(`Attempting schema validation for: "${document.uri.fsPath}" (Schema validation enabled: ${schemaValidationEnabled})`);
        const schemaUri = await getSchemaForDocument(document);
        if (schemaUri) {
            logToChannel(`Schema URI found for "${document.uri.fsPath}": ${schemaUri}`);
            const validateSchemaFn = await loadAndCompileSchema(schemaUri, document.uri);
            if (validateSchemaFn) {
                logToChannel(`Compiled schema function obtained. Validating data: ${JSON.stringify(parsedTomlData)}`); // Data should now be JSON stringifiable
                const isValid = validateSchemaFn(parsedTomlData);
                if (!isValid && validateSchemaFn.errors) {
                    logToChannel(`Schema validation failed for "${document.uri.fsPath}". Errors: ${JSON.stringify(validateSchemaFn.errors, null, 2)}`);
                    
                    let schemaErrorLine = 0;
                    let schemaErrorColStart = 0;
                    let schemaErrorColEnd = 1;

                    const schemaCommentMatchGlobal = text.match(SCHEMA_COMMENT_REGEX);
                    if (schemaCommentMatchGlobal && schemaCommentMatchGlobal.index !== undefined) {
                        const pos = document.positionAt(schemaCommentMatchGlobal.index);
                        schemaErrorLine = pos.line;
                        schemaErrorColStart = pos.character;
                        schemaErrorColEnd = document.lineAt(schemaErrorLine).text.length;
                    } else {
                        schemaErrorLine = 0;
                        schemaErrorColStart = 0;
                        schemaErrorColEnd = Math.max(1, document.lineAt(0).text.length);
                    }

                    for (const error of validateSchemaFn.errors) {
                        const range = new vscode.Range(schemaErrorLine, schemaErrorColStart, schemaErrorLine, schemaErrorColEnd);
                        let errorMessage = `Schema Validation: ${error.message || 'Unknown schema error'}`;
                        if (error.instancePath) {
                            const tomlPath = error.instancePath.replace(/^\//, '').replace(/\//g, '.') || '(root)';
                            errorMessage += ` (at TOML path: ${tomlPath})`;
                        }
                        if (error.keyword === 'additionalProperties' && error.params && error.params.additionalProperty) {
                            errorMessage += ` - Unexpected property: "${error.params.additionalProperty}"`;
                        } else if (error.keyword === 'required' && error.params && error.params.missingProperty) {
                            errorMessage += ` - Missing required property: "${error.params.missingProperty}"`;
                        }
                        const diagnostic = new vscode.Diagnostic(range, errorMessage, vscode.DiagnosticSeverity.Warning);
                        diagnostic.source = 'toml-schema';
                        diagnostics.push(diagnostic);
                        logToChannel(`Added schema diagnostic: ${errorMessage}`);
                    }
                } else if (isValid) {
                    logToChannel(`Schema validation successful for ${document.uri.fsPath} against ${schemaUri}`);
                } else {
                    logToChannel(`Schema validation returned !isValid but no errors array for ${document.uri.fsPath}. This is unusual.`);
                }
            } else {
                 logToChannel(`Failed to load or compile schema function for ${schemaUri}.`);
            }
        } else {
            logToChannel(`No schema found or configured for: ${document.uri.fsPath}`);
        }
    } else if (!parsedTomlData) {
        logToChannel(`Skipping schema validation for "${document.uri.fsPath}" due to TOML parsing errors.`);
    } else if (!schemaValidationEnabled) {
        logToChannel(`Skipping schema validation for "${document.uri.fsPath}" as it's disabled in settings.`);
    }
    
    logToChannel(`Setting ${diagnostics.length} diagnostics for ${document.uri.fsPath}`);
    diagnosticCollection.set(document.uri, diagnostics);
}

function loadConfiguration() {
    console.log('[TOML Extension] loadConfiguration called.');
    const config = vscode.workspace.getConfiguration('toml');
    schemaValidationEnabled = config.get('schema.enableValidation', true);
    const newCacheSize = config.get('schema.cache.maxSize', 20);

    if (newCacheSize !== maxSchemaCacheSize) {
        logToChannel(`Schema cache max size changing from ${maxSchemaCacheSize} to: ${newCacheSize}`);
        maxSchemaCacheSize = newCacheSize;
        while(schemaCache.size > maxSchemaCacheSize && maxSchemaCacheSize > 0) {
            const oldestKey = schemaCache.keys().next().value;
            if (oldestKey) {
                schemaCache.delete(oldestKey);
                logToChannel(`Cache eviction due to size change: ${oldestKey}`);
            } else break;
        }
        if (maxSchemaCacheSize === 0 && schemaCache.size > 0) clearSchemaCache();
    }
    logToChannel(`Configuration loaded: schemaValidationEnabled=${schemaValidationEnabled}, maxSchemaCacheSize=${maxSchemaCacheSize}`);
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('[TOML Extension] activate function called.');
    try {
        outputChannel = vscode.window.createOutputChannel("TOML Schemas");
        context.subscriptions.push(outputChannel);
        logToChannel('TOML extension with schema validation is now active!');

        ajv = new Ajv({ allErrors: true, strict: true }); 
        addFormats(ajv);
        logToChannel('Ajv initialized with formats.');

        diagnosticCollection = vscode.languages.createDiagnosticCollection('toml');
        context.subscriptions.push(diagnosticCollection);
        logToChannel('Diagnostic collection created.');

        loadConfiguration();

        logToChannel('Initial validation for already open documents...');
        vscode.workspace.textDocuments.forEach(doc => {
            if (doc.languageId === 'toml') {
                validateTomlDocument(doc);
            }
        });
        logToChannel('Initial validation scan complete.');

        context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => {
            logToChannel(`onDidOpenTextDocument: ${doc.uri.fsPath}`);
            if (doc.languageId === 'toml') validateTomlDocument(doc);
        }));
        
        let validateTimeout;
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'toml') {
                logToChannel(`onDidChangeTextDocument: ${event.document.uri.fsPath} (debounced)`);
                clearTimeout(validateTimeout);
                validateTimeout = setTimeout(() => validateTomlDocument(event.document), 500);
            }
        }));
        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
            logToChannel(`onDidCloseTextDocument: ${doc.uri.fsPath}`);
            diagnosticCollection.delete(doc.uri);
        }));
        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
            logToChannel(`onDidSaveTextDocument: ${doc.uri.fsPath}`);
            if (doc.languageId === 'toml') validateTomlDocument(doc);
        }));

        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            logToChannel('onDidChangeConfiguration event triggered.');
            if (e.affectsConfiguration('toml')) { 
                logToChannel('TOML configuration possibly changed.');
                if (e.affectsConfiguration('toml.schema')) {
                     logToChannel('TOML schema specific configuration changed.');
                }
                const oldAssociations = JSON.stringify(vscode.workspace.getConfiguration('toml').get('schema.associations'));
                loadConfiguration(); 

                const newAssociations = JSON.stringify(vscode.workspace.getConfiguration('toml').get('schema.associations'));
                if (e.affectsConfiguration('toml.schema.associations') || oldAssociations !== newAssociations) {
                    logToChannel('Schema associations changed, clearing cache.');
                    clearSchemaCache();
                }
                
                logToChannel('Re-validating all open TOML documents due to configuration change.');
                vscode.workspace.textDocuments.forEach(doc => {
                    if (doc.languageId === 'toml') validateTomlDocument(doc);
                });
            }
        }));

        let disposableClearCache = vscode.commands.registerCommand('toml.clearSchemaCache', () => {
            logToChannel('Command toml.clearSchemaCache executed.');
            clearSchemaCache();
            vscode.window.showInformationMessage('TOML schema cache cleared.');
            logToChannel('Re-validating open documents after cache clear command.');
            vscode.workspace.textDocuments.forEach(doc => {
                if (doc.languageId === 'toml') validateTomlDocument(doc);
            });
        });
        context.subscriptions.push(disposableClearCache);
        logToChannel('Activation complete.');

    } catch (e) {
        console.error('[TOML Extension] CRITICAL ERROR during activation:', e);
        vscode.window.showErrorMessage(`TOML Extension failed to activate: ${e.message}`);
    }
}

function deactivate() {
    console.log('[TOML Extension] deactivate function called.');
    if (diagnosticCollection) diagnosticCollection.dispose();
    if (outputChannel) {
        logToChannel('Deactivating "toml-hilighter" with schema validation.'); 
        outputChannel.dispose();
    }
    clearSchemaCache();
}

module.exports = {
    activate,
    deactivate
};