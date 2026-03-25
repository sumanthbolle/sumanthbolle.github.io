const fs = require('fs');
const path = require('path');

function resolveExistingPath(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

const REPO_ROOT = path.resolve(__dirname, '..');

function rootPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

const POSTS_FILE = resolveExistingPath([
  rootPath('data', 'posts.json'),
  rootPath('posts.json')
]);

const INTERVIEWS_FILE = resolveExistingPath([
  rootPath('data', 'interviews.json'),
  rootPath('interviews.json')
]);

module.exports = {
  POSTS_FILE,
  INTERVIEWS_FILE,
};
