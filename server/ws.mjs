// A small WebSocket server (RFC 6455) on node's own http, so the game server needs no packages.
// Text messages only, which is all the game sends.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX = 1 << 20; // a message from a page is small (an answer); anything bigger is dropped

export class Socket extends EventEmitter {
  constructor(sock) {
    super();
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.parts = [];
    this.open = true;
    sock.setNoDelay(true);
    sock.on('data', (d) => this.onData(d));
    sock.on('close', () => this.gone());
    sock.on('error', () => this.gone());
    this.ping = setInterval(() => this.frame(0x9, Buffer.alloc(0)), 25000); // keeps hosts' idle timeouts away
  }
  gone() {
    if (!this.open) return;
    this.open = false;
    clearInterval(this.ping);
    this.sock.destroy();
    this.emit('close');
  }
  close() { this.frame(0x8, Buffer.alloc(0)); this.gone(); }
  send(text) { this.frame(0x1, Buffer.from(text)); }
  frame(op, data) {
    if (!this.open) return;
    const n = data.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.alloc(10);
    if (n >= 65536) { head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.sock.write(Buffer.concat([head, data]));
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = b0 & 0x80, op = b0 & 0x0f, masked = b1 & 0x80;
      let n = b1 & 0x7f, at = 2;
      if (n === 126) { if (this.buf.length < 4) return; n = this.buf.readUInt16BE(2); at = 4; }
      else if (n === 127) { if (this.buf.length < 10) return; n = Number(this.buf.readBigUInt64BE(2)); at = 10; }
      if (n > MAX || !masked) { this.gone(); return; } // pages always mask what they send
      if (this.buf.length < at + 4 + n) return;
      const mask = this.buf.subarray(at, at + 4);
      const data = Buffer.from(this.buf.subarray(at + 4, at + 4 + n));
      for (let i = 0; i < n; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(at + 4 + n);
      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this.frame(0xA, data); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x0) {
        this.parts.push(data);
        if (fin) { const text = Buffer.concat(this.parts).toString('utf8'); this.parts = []; this.emit('message', text); }
      }
    }
  }
}

// Turns an http 'upgrade' into a Socket; anything else gets a 400.
export function upgrade(req, sock) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return null; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  return new Socket(sock);
}
