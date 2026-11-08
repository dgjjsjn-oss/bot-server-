const net = require('net');

/*
 * Minimal Minecraft status ping client (pure Node, no extra deps).
 * Works on Minecraft 1.7+ protocol.
 * Sends Handshake + Status Request, reads the JSON response.
 * Safe: read-only, no login, no commands, no open ports.
 */

function encodeVarInt(value) {
  const buf = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    buf.push(byte);
  } while (value !== 0);
  return Buffer.from(buf);
}

function encodeString(str) {
  const bytes = Buffer.from(str, 'utf8');
  return Buffer.concat([encodeVarInt(bytes.length), bytes]);
}

function encodeShort(value) {
  return Buffer.from([(value >> 8) & 0xff, value & 0xff]);
}

function decodeVarInt(buf, offset) {
  let result = 0;
  let shift = 0;
  let byte;
  let i = offset;
  do {
    byte = buf[i];
    result |= (byte & 0x7f) << shift;
    shift += 7;
    i++;
  } while (byte & 0x80);
  return { value: result, nextOffset: i };
}

function pingServer(host, port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let timedOut = false;
    let timer;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      socket.destroy();
    };

    timer = setTimeout(() => {
      timedOut = true;
      cleanup();
      reject(new Error('ping timeout'));
    }, timeoutMs);

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      // Protocol version 47 = 1.8.x, 761 = 1.19.x, 763 = 1.20.x.
      // Using 763 works for most modern servers; older servers still respond.
      const protocolVersion = 763;
      const nextState = 1; // Status

      const handshake = Buffer.concat([
        encodeVarInt(0), // packet id
        encodeVarInt(protocolVersion),
        encodeString(host),
        encodeShort(port),
        encodeVarInt(nextState)
      ]);
      const handshakeWithLen = Buffer.concat([encodeVarInt(handshake.length), handshake]);

      const statusReq = Buffer.concat([encodeVarInt(0)]); // packet id 0x00
      const statusReqWithLen = Buffer.concat([encodeVarInt(statusReq.length), statusReq]);

      socket.write(handshakeWithLen);
      socket.write(statusReqWithLen);
    });

    let received = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);

      try {
        const { value: len, nextOffset } = decodeVarInt(received, 0);
        if (received.length < nextOffset + len) return; // incomplete

        const packet = received.subarray(nextOffset, nextOffset + len);
        const { value: packetId, nextOffset: pidEnd } = decodeVarInt(packet, 0);
        const jsonBytes = packet.subarray(pidEnd);
        const jsonStr = jsonBytes.toString('utf8');

        cleanup();
        resolve({ ok: true, raw: jsonStr });
      } catch (e) {
        // keep waiting for more data or let timeout handle it
      }
    });

    socket.on('error', (err) => {
      if (timedOut) return;
      cleanup();
      reject(err);
    });

    socket.on('close', () => {
      // let promise resolve/reject via other handlers
    });

    socket.connect(port, host);
  });
}

module.exports = { pingServer };
