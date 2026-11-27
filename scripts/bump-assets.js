// Give every local <script>/<link> in index.html a new ?v= so browsers drop their
// cached copies after a deploy. Run before merging a change to js/ or css/:
//   npm run bump-assets
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'index.html');
const d = new Date();
const stamp = d.toISOString().slice(0, 10).replace(/-/g, '') + d.toISOString().slice(11, 16).replace(':', '');
const html = fs.readFileSync(file, 'utf8')
  .replace(/((?:src|href)="(?:js|css)\/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g, `$1?v=${stamp}"`);
fs.writeFileSync(file, html);
console.log('assets version →', stamp);
