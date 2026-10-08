const assert = require('assert');
const vscode = require('vscode');
const { setAssociations, writeFile, openToml, hasCompletion } = require('./helpers');

async function run() {
    const schemaUri = await writeFile('schema.json', JSON.stringify({
        type: 'object',
        properties: { association_test_count: { type: 'integer', minimum: 1 } }
    }));
    const schemaPath = schemaUri.fsPath;
    const cases = [
        ['**/pyproject.toml', 'globstar/pyproject.toml'],
        ['**/pyproject.toml', 'pyproject.toml'],
        ['pyproject.toml', 'filename/nested/pyproject.toml'],
        ['**/my-project/*.toml', 'scoped/my-project/config.toml'],
        ['**/my-project/*.toml', 'scoped/my-project/nested/config.toml', false],
        ['**/{pyproject,uv}.toml', 'braces/uv.toml'],
        ['**/config?.toml', 'question/config1.toml'],
        ['**/config[12].toml', 'class/config2.toml'],
        ['**\\windows\\*.toml', 'windows/config.toml'],
        ['**/pyproject.toml', 'negative/other.toml', false],
        ['**/pyproject.toml', 'negative/pyproject.toml.bak.toml', false],
        [vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'absolute', '*.toml').path,
            'absolute/config.toml']
    ];
    for (const [pattern, relativePath, matches = true] of cases) {
        await setAssociations({ [pattern]: schemaPath });
        const { document, diagnostics } = await openToml(relativePath, 'association_test_count = 0\n');
        assert.strictEqual(diagnostics.length, matches ? 1 : 0, `${pattern} against ${relativePath}`);
        if (matches) assert.match(diagnostics[0].message, /must be >= 1/);
        assert.strictEqual(await hasCompletion(document, 'association_test_count'), matches,
            `schema completions for ${relativePath}`);
        console.log(`PASS: ${pattern} against ${relativePath} (${matches ? 'match' : 'no match'})`);
    }

    // In-file schema comments still take priority over settings associations.
    const override = await writeFile('override.json', JSON.stringify({
        type: 'object', properties: { association_test_count: { type: 'integer', minimum: 10 } }
    }));
    await setAssociations({ '**/pyproject.toml': schemaPath });
    const result = await openToml('comment/pyproject.toml', `# $schema: ${override.fsPath}\nassociation_test_count = 5\n`);
    assert.match(result.diagnostics[0].message, /must be >= 10/);
    console.log('PASS: schema comment takes precedence');

    // Each folder can associate the same filename with a different schema.
    const secondFolder = vscode.workspace.workspaceFolders[1];
    await setAssociations({ '**/pyproject.toml': override.fsPath }, secondFolder);
    const scoped = await openToml('folder/pyproject.toml', 'association_test_count = 5\n', secondFolder);
    assert.match(scoped.diagnostics[0].message, /must be >= 10/);
    console.log('PASS: folder-scoped associations');
}

module.exports = { run };
