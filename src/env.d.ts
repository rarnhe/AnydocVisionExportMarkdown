declare const __BUILD_TARGET__: 'node' | 'jxa';

declare module '*.wasm' {
  const base64Content: string;
  export default base64Content;
}