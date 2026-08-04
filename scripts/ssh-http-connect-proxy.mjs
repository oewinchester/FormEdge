import net from "node:net";

const [targetHost, rawTargetPort] = process.argv.slice(2);
const targetPort = Number(rawTargetPort);
const proxyValue = process.env.HTTPS_PROXY ?? process.env.https_proxy;

if (!targetHost || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65_535) {
  fail("Geçerli hedef host ve port gereklidir.");
}
if (!proxyValue) {
  fail("HTTPS_PROXY tanımlı değil.");
}

let proxy;
try {
  proxy = new URL(proxyValue);
} catch {
  fail("HTTPS_PROXY geçerli bir URL değil.");
}
if (proxy.protocol !== "http:" || proxy.username || proxy.password) {
  fail("Yalnız kimlik bilgisi içermeyen HTTP CONNECT proxy desteklenir.");
}

const proxyPort = Number(proxy.port || 80);
const socket = net.connect({ host: proxy.hostname, port: proxyPort });
socket.setTimeout(20_000);

let responseBuffer = Buffer.alloc(0);
const onHandshakeData = (chunk) => {
  responseBuffer = Buffer.concat([responseBuffer, chunk]);
  if (responseBuffer.byteLength > 16_384) {
    socket.destroy(new Error("Proxy yanıt başlığı güvenlik sınırını aştı."));
    return;
  }
  const boundary = responseBuffer.indexOf("\r\n\r\n");
  if (boundary < 0) return;
  const header = responseBuffer.subarray(0, boundary).toString("latin1");
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})\b/i.exec(header);
  if (statusMatch?.[1] !== "200") {
    socket.destroy(new Error(`HTTP CONNECT ${statusMatch?.[1] ?? "geçersiz yanıt"}`));
    return;
  }

  socket.off("data", onHandshakeData);
  socket.setTimeout(0);
  const remaining = responseBuffer.subarray(boundary + 4);
  if (remaining.byteLength > 0) process.stdout.write(remaining);
  process.stdin.pipe(socket);
  socket.pipe(process.stdout);
  process.stdin.resume();
};

socket.once("connect", () => {
  socket.write(
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`
    + `Host: ${targetHost}:${targetPort}\r\n`
    + "Proxy-Connection: Keep-Alive\r\n\r\n",
  );
});
socket.on("data", onHandshakeData);
socket.once("timeout", () => socket.destroy(new Error("HTTP CONNECT zaman aşımına uğradı.")));
socket.once("error", (error) => fail(error.message));

function fail(message) {
  process.stderr.write(`FormEdge GitHub tunnel: ${message}\n`);
  process.exit(1);
}
