// The published @types/heic-convert types `buffer` as `ArrayBufferLike`, but the
// library's runtime (heic-decode) requires an *iterable* typed array — a raw
// ArrayBuffer throws "Spread syntax requires ...iterable". Correct the binding
// to the Uint8Array/Buffer the runtime actually accepts. (Local type fix only.)
declare module "heic-convert" {
  interface ConversionOptions {
    buffer: Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  function convert(image: ConversionOptions): Promise<ArrayBuffer>;
  export = convert;
}
