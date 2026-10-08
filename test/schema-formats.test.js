const assert = require('assert');
const { setAssociations, writeFile, openToml, hasCompletion } = require('./helpers');

async function run() {
    await setAssociations({});
    const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        additionalProperties: false,
        required: ['format_test_count'],
        definitions: {
            nestedCount: { type: 'integer', format: 'uint16', minimum: 1 }
        },
        properties: {
            format_test_count: { type: 'integer', format: 'uint', minimum: 1 },
            nested_count: { $ref: '#/definitions/nestedCount' },
            email: { type: 'string', format: 'email' },
            url: { type: 'string', format: 'uri' },
            standard_int: { type: 'integer', format: 'int32' },
            custom: { type: 'string', format: 'example-custom-format' },
            uint64_count: { type: 'integer', format: 'uint64', minimum: 0 },
            uint32_count: { type: 'integer', format: 'uint32', minimum: 0 },
            uint8_count: { type: 'integer', format: 'uint8', minimum: 0 }
        }
    };
    const schemaUri = await writeFile('formats.json', JSON.stringify(schema));
    const cases = [
        ['minimum', 'format_test_count = 0\n', /must be >= 1/],
        ['type', 'format_test_count = "wrong"\n', /must be integer/],
        ['reference', 'format_test_count = 1\nnested_count = 0\n', /must be >= 1/],
        ['email', 'format_test_count = 1\nemail = "invalid"\n', /must match format "email"/],
        ['uri', 'format_test_count = 1\nurl = "not a URI"\n', /must match format "uri"/],
        ['int32', 'format_test_count = 1\nstandard_int = 2147483648\n', /must match format "int32"/],
        ['required', 'custom = "value"\n', /Missing required property: "format_test_count"/],
        ['additional', 'format_test_count = 1\nextra = true\n', /Unexpected property: "extra"/],
        ['valid', 'format_test_count = 1\nnested_count = 1\nemail = "user@example.com"\nurl = "https://example.com"\nstandard_int = 42\ncustom = "value"\nuint64_count = 0\nuint32_count = 0\nuint8_count = 0\n', null]
    ];
    for (const [name, text, errorPattern] of cases) {
        const { document, diagnostics } = await openToml(`formats/${name}.toml`, `# $schema: ${schemaUri.fsPath}\n${text}`);
        assert.strictEqual(diagnostics.length, errorPattern ? 1 : 0, name);
        if (errorPattern) assert.match(diagnostics[0].message, errorPattern);
        assert.ok(await hasCompletion(document, 'format_test_count'), `schema completion: ${name}`);
        console.log(`PASS: unknown formats with ${name} validation and completion`);
    }

    if (process.env.TOML_TEST_LIVE_SCHEMAS === '1') {
        const liveCases = [
            ['codex', 'https://developers.openai.com/codex/config-schema.json', 'model = 123\n', /must be string/, 'model'],
            ['uv', 'https://raw.githubusercontent.com/astral-sh/uv/main/uv.schema.json', 'concurrent-downloads = 0\n', /must be >= 1/, 'concurrent-downloads']
        ];
        for (const [name, url, text, errorPattern, completion] of liveCases) {
            const { document, diagnostics } = await openToml(`live/${name}.toml`, `# $schema: ${url}\n${text}`);
            assert.ok(diagnostics.some(diagnostic => errorPattern.test(diagnostic.message)), `live ${name} diagnostics`);
            assert.ok(await hasCompletion(document, completion), `live ${name} schema completion`);
            console.log(`PASS: live ${name} schema validation and completion`);
        }
    }
}

module.exports = { run };
