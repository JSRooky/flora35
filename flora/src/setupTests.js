// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

if (!global.TextDecoder) {
  global.TextDecoder = require('util').TextDecoder;
}

if (!global.TextEncoder) {
  global.TextEncoder = require('util').TextEncoder;
}

if (!global.performance) {
  global.performance = {};
}

if (!global.performance.mark) {
  global.performance.mark = () => {};
}

jest.spyOn(console, 'error').mockImplementation((message) => {
  if (typeof message === 'string' && message.includes('HTMLCanvasElement.prototype.getContext')) {
    return;
  }
  if (typeof message === 'string' && message.includes('Failed to initialize WebGL')) {
    return;
  }
  console.error(message);
});
