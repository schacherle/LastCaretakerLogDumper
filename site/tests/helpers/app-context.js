const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_PATH = path.resolve(__dirname, '../../app.js');
const APP_CODE = fs.readFileSync(APP_PATH, 'utf8');

/**
 * Loads site/app.js in an isolated Node vm context simulating the browser environment.
 * @param {object} options
 * @param {string} [options.search] - e.g. "?repo=owner/repo"
 * @param {string} [options.hostname] - e.g. "user.github.io"
 * @param {string} [options.pathname] - e.g. "/repo-name/"
 * @param {string} [options.origin] - e.g. "https://user.github.io"
 * @param {string} [options.hash] - e.g. "#mode=browse&scope=logs"
 * @param {object} [options.extraGlobals] - extra globals like Diff
 * @returns {object} The sandbox context containing all top-level functions and variables, plus an `evalInContext` helper.
 */
function loadAppContext(options = {}) {
  const {
    search = '?repo=test-owner/test-repo',
    hostname = 'localhost',
    pathname = '/',
    origin = 'http://localhost',
    hash = '',
    extraGlobals = {},
  } = options;

  let currentHash = hash;

  const mockLocation = {
    search,
    hostname,
    pathname,
    origin,
    get hash() {
      return currentHash;
    },
    set hash(val) {
      currentHash = val;
    },
  };

  const mockHistory = {
    replaceState(_state, _title, url) {
      if (typeof url === 'string') {
        const hashIdx = url.indexOf('#');
        if (hashIdx !== -1) {
          currentHash = url.slice(hashIdx);
        } else {
          currentHash = '';
        }
      }
    },
  };

  const mockDocument = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
          contains: () => false,
        },
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
        removeChild: () => {},
        addEventListener: () => {},
      };
      return el;
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };

  const mockWindow = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getSelection: () => null,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
  };

  const sandbox = {
    location: mockLocation,
    history: mockHistory,
    document: mockDocument,
    window: mockWindow,
    navigator: { clipboard: null },
    URLSearchParams,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    console,
    Set,
    Map,
    Promise,
    Date,
    JSON,
    Math,
    parseInt,
    parseFloat,
    isNaN,
    Number,
    String,
    Boolean,
    RegExp,
    ...extraGlobals,
  };

  vm.createContext(sandbox);
  vm.runInContext(APP_CODE, sandbox);

  sandbox.evalInContext = (code) => vm.runInContext(code, sandbox);

  return sandbox;
}

/**
 * Normalizes objects/arrays across VM boundary for node:assert/strict deepStrictEqual.
 */
function toPlain(val) {
  return structuredClone(val);
}

module.exports = {
  loadAppContext,
  toPlain,
  APP_PATH,
};
