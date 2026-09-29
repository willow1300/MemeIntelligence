const fs = require('fs');
const fs = require('fs');
const out = [];
const line = (l) => out.push(l);

const w = (p, s) => fs.writeFileSync(p, s);
console.log('generator ready');
