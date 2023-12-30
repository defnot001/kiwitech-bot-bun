export class RconError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RconError';
  }
}

export const ERROR_MESSAGES = {
  NOT_CONNECTED: 'Cannot send command because the client is not connected',
  ALREADY_CONNECTED: 'Already connected. Please disconnect before trying to connect again.',
  AUTH_FAILED: 'Client authentification failed',
  END_CALLED_TWICE: 'End called twice',
  SOCKET_NOT_INITIALIZED: 'Socket is not initialized',
  CONNECTION_FAILED: 'Failed to connect to the server.',
};
