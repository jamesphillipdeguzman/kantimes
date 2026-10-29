const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const missing = new Set();
while ((match = regex.exec(script)) !== null) {
  const id = match[1];
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    missing.add(id);
  }
}
console.log('IDs in script.js but not in index.html:');
missing.forEach(id => console.log('- ' + id));
