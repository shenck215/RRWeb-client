/**
 * 将 JSON 文本压缩并编码为 Base64 字符串。
 *
 * 返回值语义：
 * - 优先使用 CompressionStream('gzip')：返回 **gzip 压缩后的 Base64**；
 * - 若不支持 gzip，则返回 **未压缩的 UTF-8→Base64**（也就是纯文本的 base64）；
 * - 始终返回字符串，不抛出异常（失败会逐级降级）。
 *
 * @param json 原始 JSON 字符串（需已是合法 JSON）
 * @returns base64 字符串（可能是 gzip 后的，也可能是未压缩的）
 */
export declare const gzipJson: (json: string) => Promise<string>;
