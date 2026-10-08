const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'toml-schema-tests-'));
    try {
        const folders = ['first', 'second'];
        for (const folder of folders) {
            await fs.mkdir(path.join(temporaryDirectory, folder));
        }
        const workspacePath = path.join(temporaryDirectory, 'tests.code-workspace');
        await fs.writeFile(workspacePath, JSON.stringify({
            folders: folders.map(folder => ({ path: folder })),
            settings: { 'files.autoSave': 'off' }
        }));
        await runTests({
            vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
            extensionDevelopmentPath: path.resolve(__dirname, '..'),
            extensionTestsPath: path.join(__dirname, 'index.js'),
            launchArgs: [
                workspacePath,
                '--user-data-dir', path.join(temporaryDirectory, 'user-data'),
                '--extensions-dir', path.join(temporaryDirectory, 'extensions'),
                '--disable-extensions',
                '--disable-workspace-trust',
                '--skip-welcome',
                '--skip-release-notes'
            ]
        });
    } finally {
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
