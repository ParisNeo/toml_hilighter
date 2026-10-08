const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

async function run() {
    const extension = vscode.extensions.getExtension('ParisNeo.toml-hilighter');
    assert.ok(extension, 'Extension under test is present');
    await extension.activate();
    const suites = fs.readdirSync(__dirname).filter(name => name.endsWith('.test.js')).sort();
    assert.ok(suites.length, 'At least one regression suite is present');
    for (const suite of suites) {
        await require(path.join(__dirname, suite)).run();
    }
}

module.exports = { run };
