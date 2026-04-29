declare module 'react-dom' {
  import type { ComponentChild } from 'preact';
  export function render(vnode: ComponentChild, parent: Element | DocumentFragment): void;
  export function unmountComponentAtNode(container: Element | DocumentFragment): boolean;
}
