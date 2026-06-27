'use strict';

const { strict: assert } = require('node:assert');
const { parseTableSchemasFromSql, parseTableNamesFromSql } = require('../../../app/lib/db/schemaParse');

describe('test/lib/db/schemaSync.test.js', () => {
  const sampleSql = `
CREATE TABLE IF NOT EXISTS note_entries (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weather_history (
  city TEXT NOT NULL,
  temperature REAL
);
`;

  it('parseTableNamesFromSql', () => {
    const names = parseTableNamesFromSql(sampleSql);
    assert.deepEqual(names.sort(), [ 'note_entries', 'weather_history' ]);
  });

  it('parseTableSchemasFromSql extracts columns', () => {
    const schemas = parseTableSchemasFromSql(sampleSql);
    assert.ok(schemas.note_entries.some(c => c.name === 'session_id'));
    assert.ok(schemas.weather_history.some(c => c.name === 'city'));
    assert.equal(schemas.note_entries.find(c => c.name === 'id')?.def.includes('BIGSERIAL'), true);
  });
});
