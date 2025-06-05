// extension.js
console.log('[TOML Extension] File loaded by VS Code.'); // Top-level log

const vscode = require('vscode');
const TOML = require('@ltd/j-toml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const path = require('path');
const fs = require('fs').promises;
// const { URL } = require('url'); // URL is not explicitly used, can be removed if not needed elsewhere

/** @type {vscode.DiagnosticCollection} */
let diagnosticCollection;
let outputChannel;

// --- TOML Syntax Error Parsing ---
const tomlErrorRegex = /at line (\d+)(?:, column (\d+))?/;

// --- JSON Schema Constants and Variables ---
const SCHEMA_COMMENT_REGEX = /#\s*\$schema:\s*(\S+)/;
let ajv;
const schemaCache = new Map(); // Stores compiled schema validation functions
const rawSchemaCache = new Map(); // Stores raw (uncompiled) schema JSON objects for traversal
let maxSchemaCacheSize = 20;
let schemaValidationEnabled = true;
let schemaCompletionEnabled = true; // New setting for completions

/**
 * Logs a message to the TOML Schemas output channel.
 * Also logs to console.log for early debugging.
 * @param {string} message
 */
function logToChannel(message) {
    console.log(`[TOML LOG]: ${message}`);
    if (outputChannel) {
        outputChannel.appendLine(message);
    } else {
        console.warn("[TOML LOG PRE-CHANNEL]: " + message);
    }
}

/**
 * Manages schema caches, adding new schemas and evicting the oldest if the cache exceeds maxSize.
 * @param {string} schemaUri The URI of the schema.
 * @param {any} rawSchema The raw JSON schema object.
 * @param {import('ajv').ValidateFunction} compiledSchema The compiled schema function.
 */
function cacheSchemas(schemaUri, rawSchema, compiledSchema) {
    if (maxSchemaCacheSize === 0) return;

    if (schemaCache.size >= maxSchemaCacheSize && !schemaCache.has(schemaUri)) {
        const oldestKey = schemaCache.keys().next().value;
        if (oldestKey) {
            schemaCache.delete(oldestKey);
            rawSchemaCache.delete(oldestKey);
            logToChannel(`Cache full. Evicted schema: ${oldestKey}`);
        }
    }
    rawSchemaCache.set(schemaUri, rawSchema);
    schemaCache.set(schemaUri, compiledSchema);
    logToChannel(`Cached schema (raw & compiled): ${schemaUri}. Cache size: ${schemaCache.size}`);
}

/**
 * Clears schema caches.
 */
function clearSchemaCaches() {
    schemaCache.clear();
    rawSchemaCache.clear();
    logToChannel('Schema caches (raw & compiled) cleared.');
}

/**
 * Loads and compiles a JSON schema from a URI (file or HTTP/S).
 * Stores both raw and compiled schema in respective caches.
 * @param {string} schemaUri The URI of the schema.
 * @param {vscode.Uri} documentUri The URI of the TOML document, for resolving relative paths.
 * @returns {Promise<{raw: any, compiled: import('ajv').ValidateFunction} | null>}
 */
async function loadAndCacheSchemaObjects(schemaUri, documentUri) {
    logToChannel(`loadAndCacheSchemaObjects called for schema URI: "${schemaUri}", document: "${documentUri ? documentUri.fsPath : 'N/A'}"`);
    if (maxSchemaCacheSize > 0 && schemaCache.has(schemaUri) && rawSchemaCache.has(schemaUri)) {
        logToChannel(`Schema cache hit for: ${schemaUri}`);
        return { raw: rawSchemaCache.get(schemaUri), compiled: schemaCache.get(schemaUri) };
    }

    logToChannel(`Loading schema for caching (raw & compiled): ${schemaUri}`);
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

        const rawSchemaJson = JSON.parse(schemaContent);
        logToChannel(`Schema content parsed to JSON for: ${schemaUri}`);
        
        const compiledSchemaFn = ajv.compile(rawSchemaJson);
        logToChannel(`Schema compiled by Ajv for: ${schemaUri}`);
        
        if (maxSchemaCacheSize > 0) {
            cacheSchemas(schemaUri, rawSchemaJson, compiledSchemaFn);
        }
        return { raw: rawSchemaJson, compiled: compiledSchemaFn };
    } catch (error) {
        logToChannel(`Error loading/compiling schema ${schemaUri} (resolved to ${absoluteSchemaUri}): ${error.message}. Ajv errors (if any): ${error.errors ? JSON.stringify(error.errors) : 'N/A'}`);
        // Don't show window error message here, let callers decide or rely on diagnostics
        return null;
    }
}

/**
 * Gets the raw schema object for completion suggestions.
 * @param {string} schemaUri The URI of the schema.
 * @param {vscode.Uri} documentUri The URI of the TOML document.
 * @returns {Promise<any | null>}
 */
async function getRawSchemaForCompletions(schemaUri, documentUri) {
    if (rawSchemaCache.has(schemaUri)) {
        return rawSchemaCache.get(schemaUri);
    }
    const schemas = await loadAndCacheSchemaObjects(schemaUri, documentUri);
    return schemas ? schemas.raw : null;
}

/**
 * Gets the compiled schema validation function.
 * @param {string} schemaUri The URI of the schema.
 * @param {vscode.Uri} documentUri The URI of the TOML document.
 * @returns {Promise<import('ajv').ValidateFunction | null>}
 */
async function getCompiledSchemaForValidation(schemaUri, documentUri) {
    if (schemaCache.has(schemaUri)) {
        return schemaCache.get(schemaUri);
    }
    const schemas = await loadAndCacheSchemaObjects(schemaUri, documentUri);
    return schemas ? schemas.compiled : null;
}


/**
 * Finds the schema URI for a given TOML document.
 * @param {vscode.TextDocument} document The document to find the schema for.
 * @returns {Promise<string | null>} The schema URI or null if not found.
 */
async function getSchemaUriForDocument(document) { // Renamed from getSchemaForDocument to avoid confusion
    logToChannel(`getSchemaUriForDocument for: ${document.uri.fsPath}`);
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

    logToChannel(`Attempting TOML syntax validation for: "${document.uri.fsPath}"`);
    try {
        parsedTomlData = TOML.parse(text, 1.0, '\n', false); 
        logToChannel(`TOML syntax validation successful for: "${document.uri.fsPath}".`);
        // Avoid logging full parsedTomlData by default to prevent excessively large logs for big files
        // if (parsedTomlData && Object.keys(parsedTomlData).length < 10) { // Log small objects
        //     logToChannel(`Parsed data: ${JSON.stringify(parsedTomlData)}`);
        // }
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

    if (parsedTomlData && schemaValidationEnabled) {
        logToChannel(`Attempting schema validation for: "${document.uri.fsPath}" (Schema validation enabled: ${schemaValidationEnabled})`);
        const schemaUri = await getSchemaUriForDocument(document);
        if (schemaUri) {
            logToChannel(`Schema URI found for "${document.uri.fsPath}": ${schemaUri}`);
            const validateSchemaFn = await getCompiledSchemaForValidation(schemaUri, document.uri);
            if (validateSchemaFn) {
                logToChannel(`Compiled schema function obtained. Validating data...`); // Removed data logging for brevity
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
    schemaCompletionEnabled = config.get('schema.enableCompletions', true); // Load new setting
    const newCacheSize = config.get('schema.cache.maxSize', 20);

    if (newCacheSize !== maxSchemaCacheSize) {
        logToChannel(`Schema cache max size changing from ${maxSchemaCacheSize} to: ${newCacheSize}`);
        maxSchemaCacheSize = newCacheSize;
        while(schemaCache.size > maxSchemaCacheSize && maxSchemaCacheSize > 0) {
            const oldestKey = schemaCache.keys().next().value;
            if (oldestKey) {
                rawSchemaCache.delete(oldestKey); // Also clear from raw cache
                schemaCache.delete(oldestKey);
                logToChannel(`Cache eviction due to size change: ${oldestKey}`);
            } else break;
        }
        if (maxSchemaCacheSize === 0 && schemaCache.size > 0) clearSchemaCaches();
    }
    logToChannel(`Configuration loaded: schemaValidationEnabled=${schemaValidationEnabled}, schemaCompletionEnabled=${schemaCompletionEnabled}, maxSchemaCacheSize=${maxSchemaCacheSize}`);
}


// --- Autocompletion Logic ---

/**
 * Traverses a schema object based on a path array.
 * @param {any} schema The schema object.
 * @param {string[]} pathSegments Array of path segments (keys).
 * @returns {any | null} The sub-schema or null if path is invalid.
 */
function getSchemaNode(schema, pathSegments) {
    let currentNode = schema;
    for (const segment of pathSegments) {
        if (currentNode && currentNode.properties && currentNode.properties[segment]) {
            currentNode = currentNode.properties[segment];
            // Follow $ref if present (simple, non-recursive for now)
            if (currentNode.$ref && schema.$defs && schema.$defs[currentNode.$ref.replace('#/$defs/', '')]) {
                currentNode = schema.$defs[currentNode.$ref.replace('#/$defs/', '')];
            }
        } else if (currentNode && currentNode.type === 'object' && currentNode.patternProperties) {
            // Simplistic patternProperties handling: take the first one that might match
            // This would need more robust logic for full support
            let foundPattern = false;
            for (const pattern in currentNode.patternProperties) {
                // A very naive check, real matching is complex
                // For now, just assume if there's a patternProperty, we try to use its schema
                 currentNode = currentNode.patternProperties[pattern];
                 foundPattern = true;
                 break;
            }
            if(!foundPattern) return null;

        } else if (currentNode && currentNode.type === 'array' && currentNode.items) {
            currentNode = currentNode.items; // For arrays, suggest properties of their items
             // Follow $ref for array items
            if (currentNode.$ref && schema.$defs && schema.$defs[currentNode.$ref.replace('#/$defs/', '')]) {
                currentNode = schema.$defs[currentNode.$ref.replace('#/$defs/', '')];
            }
        }
        else {
            return null; // Path segment not found
        }
    }
    return currentNode;
}


class TomlCompletionItemProvider {
    async provideCompletionItems(document, position, token, context) {
        logToChannel(`TomlCompletionItemProvider.provideCompletionItems for ${document.uri.fsPath} at L${position.line}C${position.character}`);
        if (!schemaCompletionEnabled) {
            logToChannel("Schema completions disabled.");
            return null;
        }

        const schemaUri = await getSchemaUriForDocument(document);
        if (!schemaUri) {
            logToChannel("No schema URI found for document, no schema completions.");
            return null;
        }

        const rawSchema = await getRawSchemaForCompletions(schemaUri, document.uri);
        if (!rawSchema) {
            logToChannel("Failed to load raw schema, no schema completions.");
            return null;
        }

        const lineText = document.lineAt(position.line).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        const suggestions = [];

        // Determine current TOML path (simplified for MVP)
        // This needs to be much more robust for real-world TOML
        let currentPathSegments = [];
        let currentTable = ""; 
        for(let i = position.line -1; i>=0; i--){
            const lText = document.lineAt(i).text.trim();
            if(lText.startsWith("[")){
                currentTable = lText.replace(/^\[+/, "").replace(/\]+$/, "").trim();
                break;
            }
        }
        if(currentTable){
            currentPathSegments = currentTable.split('.');
        }
        
        const keyMatch = textBeforeCursor.match(/^(\s*)([a-zA-Z0-9_.-]*)$/);
        const assignmentMatch = textBeforeCursor.match(/^\s*([a-zA-Z0-9_."'-]+)\s*=\s*$/);
        
        let activeSchemaNode = getSchemaNode(rawSchema, currentPathSegments);
        if (!activeSchemaNode) {
             logToChannel(`No active schema node found for path: ${currentPathSegments.join('.')}`);
             return null;
        }


        if (assignmentMatch) { // User is typing a value
            const fullKey = assignmentMatch[1].replace(/^["']|["']$/g, ''); // Remove quotes if any
            const keyPath = [...currentPathSegments, ...fullKey.split('.')];
            const valueSchemaNode = getSchemaNode(rawSchema, keyPath);

            if (valueSchemaNode) {
                logToChannel(`Providing value completions for key: ${keyPath.join('.')} Schema node: ${JSON.stringify(valueSchemaNode)}`);
                if (valueSchemaNode.enum) {
                    valueSchemaNode.enum.forEach(enumValue => {
                        const item = new vscode.CompletionItem(String(enumValue), vscode.CompletionItemKind.EnumMember);
                        item.detail = "Enum value";
                        if(typeof enumValue === 'string') item.insertText = `"${enumValue}"`;
                        suggestions.push(item);
                    });
                }
                if (valueSchemaNode.type === 'boolean') {
                    suggestions.push(new vscode.CompletionItem('true', vscode.CompletionItemKind.Value));
                    suggestions.push(new vscode.CompletionItem('false', vscode.CompletionItemKind.Value));
                }
            }
        } else if (keyMatch) { // User is typing a key
            const keyPrefix = keyMatch[2];
            let keyPathSoFar = currentPathSegments;
            const parts = keyPrefix.split('.');
            let partialKey = "";

            if (parts.length > 1) {
                keyPathSoFar = [...currentPathSegments, ...parts.slice(0, -1)];
                partialKey = parts[parts.length - 1];
            } else {
                partialKey = keyPrefix;
            }
            
            activeSchemaNode = getSchemaNode(rawSchema, keyPathSoFar);
             if (!activeSchemaNode || !activeSchemaNode.properties) {
                logToChannel(`No properties found for schema path: ${keyPathSoFar.join('.')}`);
                return suggestions.length > 0 ? suggestions : null;
            }

            logToChannel(`Providing key completions for path: ${keyPathSoFar.join('.')} prefix: "${partialKey}"`);

            for (const key in activeSchemaNode.properties) {
                if (key.startsWith(partialKey)) {
                    const propSchema = activeSchemaNode.properties[key];
                    const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
                    item.detail = propSchema.type ? `Type: ${propSchema.type}` : 'Property';
                    if (propSchema.description) {
                        item.documentation = new vscode.MarkdownString(propSchema.description);
                    }
                    suggestions.push(item);
                }
            }
        }
        logToChannel(`Returning ${suggestions.length} completion items.`);
        return suggestions.length > 0 ? suggestions : null;
    }
}


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('[TOML Extension] activate function called.');
    try {
        outputChannel = vscode.window.createOutputChannel("TOML Schemas");
        context.subscriptions.push(outputChannel);
        logToChannel('TOML extension with schema validation & completion is now active!');

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

        // Register completion provider
        context.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(
                { language: 'toml', scheme: 'file' }, // Apply to TOML files
                new TomlCompletionItemProvider(),
                '.' // Trigger completion on '.'
            )
        );
        logToChannel('TomlCompletionItemProvider registered.');


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
                    clearSchemaCaches(); // Use new function for both caches
                }
                
                logToChannel('Re-validating all open TOML documents due to configuration change.');
                vscode.workspace.textDocuments.forEach(doc => {
                    if (doc.languageId === 'toml') validateTomlDocument(doc);
                });
            }
        }));

        let disposableClearCache = vscode.commands.registerCommand('toml.clearSchemaCache', () => {
            logToChannel('Command toml.clearSchemaCache executed.');
            clearSchemaCaches(); // Use new function
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
        logToChannel('Deactivating "toml-hilighter" with schema validation & completion.'); 
        outputChannel.dispose();
    }
    clearSchemaCaches(); // Use new function
}

module.exports = {
    activate,
    deactivate
};