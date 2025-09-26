interface CompressionStream {
	readonly readable: ReadableStream<Uint8Array<ArrayBuffer>>;
	readonly writable: WritableStream<BufferSource>;
}
declare var CompressionStream: {
	prototype: CompressionStream;
	new (format: "gzip" | "deflate" | "deflate-raw"): CompressionStream;
};

interface DecompressionStream {
	readonly readable: ReadableStream<Uint8Array<ArrayBuffer>>;
	readonly writable: WritableStream<BufferSource>;
}
declare var DecompressionStream: {
	prototype: DecompressionStream;
	new (format: "gzip" | "deflate" | "deflate-raw"): DecompressionStream;
};
