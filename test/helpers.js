const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');
const vscode = require('vscode');

async function setAssociations(associations, folder) {
    await vscode.workspace.getConfiguration('toml', folder ? folder.uri : undefined).update(
        'schema.associations', associations,
        folder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Workspace
    );
}

async function writeFile(relativePath, content, folder = vscode.workspace.workspaceFolders[0]) {
    const filePath = path.join(folder.uri.fsPath, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return vscode.Uri.file(filePath);
}

async function openToml(relativePath, text, folder) {
    const uri = await writeFile(relativePath, text, folder);
    let subscription;
    let timer;
    const validated = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`No diagnostics update for ${uri.fsPath}`)), 10000);
        subscription = vscode.languages.onDidChangeDiagnostics(event => {
            if (event.uris.some(changedUri => changedUri.toString() === uri.toString())) {
                resolve(vscode.languages.getDiagnostics(uri).filter(diagnostic => diagnostic.source === 'toml-schema'));
            }
        });
    });
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        assert.strictEqual(document.languageId, 'toml');
        return { document, diagnostics: await validated };
    } finally {
        clearTimeout(timer);
        subscription.dispose();
    }
}

async function hasCompletion(document, label) {
    const completions = await vscode.commands.executeCommand(
        'vscode.executeCompletionItemProvider', document.uri,
        new vscode.Position(document.lineCount - 1, 0)
    );
    return !!completions && completions.items.some(item =>
        (typeof item.label === 'string' ? item.label : item.label.label) === label &&
        item.kind === vscode.CompletionItemKind.Property
    );
}

module.exports = { setAssociations, writeFile, openToml, hasCompletion };
