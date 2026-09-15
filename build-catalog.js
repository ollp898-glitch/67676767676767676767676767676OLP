// Rebuild the additive catalog from an existing snapshot, without API requests.
const fs = require('node:fs');
const path = require('node:path');
const { writeCatalog } = require('./event-catalog');
const input = process.argv[2] || 'out/markets.jsonl';
const output = process.argv[3] || 'out';
const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
fs.mkdirSync(output, { recursive: true });
console.log(JSON.stringify(writeCatalog(rows, path.resolve(output)), null, 2));
