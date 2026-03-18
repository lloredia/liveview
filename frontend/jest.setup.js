// jest.setup.js - Jest configuration and global setup

require('@testing-library/jest-dom');

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({
    route: '/',
    pathname: '/',
    query: {},
    asPath: '/',
    push: jest.fn(),
    replace: jest.fn(),
    reload: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
    beforePopState: jest.fn(),
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
    isFallback: false,
  }),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }) => {
    return children;
  };
});

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    const { src, alt, width, height, ...rest } = props;
    return {
      $$typeof: Symbol.for('react.element'),
      type: 'img',
      props: { src, alt, width, height, ...rest },
      key: null,
      ref: null,
    };
  },
}));

// Suppress console errors/warnings in tests (optional)
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args) => {
    const firstArg =
      typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof Error
          ? args[0].message
          : '';
    if (
      firstArg &&
      (firstArg.includes('Warning: ReactDOM.render') ||
        firstArg.includes('Warning: useLayoutEffect') ||
        firstArg.includes('Not implemented: HTMLFormElement.prototype.submit') ||
        firstArg.includes('Not implemented: HTMLFormElement.prototype.requestSubmit'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Set test timeout
jest.setTimeout(10000);

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', {
  configurable: true,
  writable: true,
  value: function requestSubmit() {
    this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  },
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};

