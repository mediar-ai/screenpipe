/// <reference types="react" />
/// <reference types="react-dom" />

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}