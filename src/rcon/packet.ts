export type Packet = {
  id: number;
  type: PacketTypeValue;
  payload: Buffer;
};

export const PacketType = {
  Auth: 3,
  AuthResponse: 2,
  Command: 2,
  CommandResponse: 0,
} as const;

export type PacketTypeValue = (typeof PacketType)[keyof typeof PacketType];

export default abstract class PacketUtils {
  static encodePacket(packet: Packet): Buffer {
    const buffer = Buffer.alloc(packet.payload.length + 14);

    buffer.writeInt32LE(packet.payload.length + 10, 0);
    buffer.writeInt32LE(packet.id, 4);
    buffer.writeInt32LE(packet.type, 8);
    packet.payload.copy(buffer, 12);

    return buffer;
  }

  static decodePacket(buffer: Buffer): Packet {
    const length = buffer.readInt32LE(0);
    const id = buffer.readInt32LE(4);
    const type = buffer.readInt32LE(8) as PacketTypeValue;

    if (![0, 2, 3].includes(type)) {
      throw new Error(`Invalid type: ${type}`);
    }

    const payload = buffer.slice(12, length + 2);

    return {
      id,
      type,
      payload,
    };
  }
}
