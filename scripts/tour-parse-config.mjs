import { parse } from '@babel/parser';
import { readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../reference/tour/', import.meta.url);
const locale = await readFile(new URL('locale.raw.txt', directory), 'utf8');
const translations = new Map(
  locale.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([^#=]+?)\s*=\s*(.*)$/);
    return match ? [[match[1].trim(), match[2].trim()]] : [];
  }),
);
const ast = parse(
  await readFile(new URL('config.general.raw.js', directory), 'utf8'),
);
let root;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'script')
    root = node.init;
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach(visit);
    else if (child && typeof child === 'object') visit(child);
  }
}
visit(ast);
if (!root)
  throw new Error(
    'No script object found; inspect the config instead of guessing.',
  );
// Parse literal config only. Never execute downloaded JavaScript or action strings.
function literal(node) {
  if (!node) return undefined;
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'ArrayExpression':
      return node.elements.map(literal);
    case 'ObjectExpression':
      return Object.fromEntries(
        node.properties.flatMap((property) => {
          if (property.type !== 'ObjectProperty' || property.computed)
            return [];
          const key = property.key.name ?? property.key.value;
          const value = literal(property.value);
          return value === undefined ? [] : [[key, value]];
        }),
      );
    case 'UnaryExpression':
      if (node.operator === '-' && node.argument.type === 'NumericLiteral')
        return -node.argument.value;
      return undefined;
    case 'CallExpression':
      if (node.callee.name === 'trans')
        return translations.get(node.arguments[0]?.value);
      return undefined;
    default:
      return undefined;
  }
}
const config = literal(root);
await writeFile(
  new URL('config.parsed.json', directory),
  JSON.stringify(config, null, 2),
);
const objects = [];
function flatten(value) {
  if (!value || typeof value !== 'object') return;
  if (value.class && value.id) objects.push(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(flatten);
    else flatten(child);
  }
}
flatten(config);
const scenes = objects.filter((object) => object.class === 'Panorama');
console.log('Objects:', objects.length, 'Scenes:', scenes.length);
console.log('Sample scene:', JSON.stringify(scenes[0], null, 2).slice(0, 5000));
console.log(
  'Sample overlay:',
  JSON.stringify(
    objects.find(
      (object) => object.id === scenes[0]?.overlays?.[0]?.replace('this.', ''),
    ),
    null,
    2,
  )?.slice(0, 2500),
);
await writeFile(
  new URL('objects.json', directory),
  JSON.stringify(objects, null, 2),
);
