// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable no-console */
/**
 * 将 Uint8Array 编码为 Base64 字符串。
 *
 * - 浏览器优先：构造“二进制字符串”再 btoa（分片避免栈溢出）
 * - Node 兜底：使用 Buffer（便于在 SSR/单测环境运行）
 */
const u8ToBase64 = (u8: Uint8Array): string => {
  // Node/SSR 兜底：优先使用 Buffer（若存在）
  const g = globalThis as unknown as {
    Buffer?: { from: (u: Uint8Array) => { toString: (enc: 'base64') => string } };
  };
  if (g.Buffer?.from) {
    return g.Buffer.from(u8).toString('base64');
  }

  // 浏览器路径：分片构造“二进制字符串”，避免一次 apply 过大导致栈溢出
  let bin = '';
  const CHUNK = 0x8000; // 32KB
  for (let i = 0; i < u8.length; i += CHUNK) {
    const sub = u8.subarray(i, i + CHUNK);
    // apply + 分片是浏览器通行且安全的写法；TS 需要 number[]，用 Array.from 转一下
    // 注意：这里构造的是 ISO-8859-1/Latin-1 的“二进制字符串”，随后交给 btoa
    bin += String.fromCharCode.apply(null, Array.from(sub) as unknown as number[]);
  }

  // 浏览器原生 btoa：将“二进制字符串”转 Base64
  return btoa(bin);
};

/**
 * 检测 CompressionStream(gzip) 的可用性：
 * - 既需要存在构造器名，又要能 new 成功（某些浏览器存在名但不支持 gzip）
 */
const hasCompressionStream = (): boolean => {
  try {
    if (typeof CompressionStream === 'undefined') return false;
    // 这里 new 一下是为了验证 'gzip' 格式是否真的支持
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = new CompressionStream('gzip');
    return true;
  } catch {
    return false;
  }
};

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
export const gzipJson = async (json: string): Promise<string> => {
  try {
    if (hasCompressionStream()) {
      // 走原生流式 gzip：Blob -> ReadableStream -> pipeThrough(gzip) -> ArrayBuffer
      const gzStream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = await new Response(gzStream).arrayBuffer();
      return u8ToBase64(new Uint8Array(buf));
    }

    // —— Fallback A：无 CompressionStream，走“未压缩的 UTF-8→Base64” —— //
    // 说明：直接 btoa(json) 会在遇到非 ASCII 字符时抛错，这里先 UTF-8 编码再转 Base64
    if (typeof TextEncoder !== 'undefined') {
      return u8ToBase64(new TextEncoder().encode(json));
    }

    // —— Fallback B：极旧环境没有 TextEncoder —— //
    // 退而求其次使用 encodeURIComponent + unescape 构造近似的“字节流”，再 btoa
    // 该方案已不推荐，但可作为兜底避免链路中断
    return btoa(unescape(encodeURIComponent(json)));
  } catch (err) {
    console.error('[gzipJson] failed:', err);
    // 进一步兜底：尽量返回“未压缩的 Base64”，若仍失败则返回原文（不建议，但保证不抛错）
    try {
      if (typeof TextEncoder !== 'undefined') {
        return u8ToBase64(new TextEncoder().encode(json));
      }
      return btoa(unescape(encodeURIComponent(json)));
    } catch (e2) {
      console.error('[gzipJson] fallback base64 failed:', e2);
      return json; // 保底：返回原文，避免调用栈断裂（上游需按 compressed 标志决定解析方式）
    }
  }
};
