/** Base class for flasher errors. `message` is shown to users, so it must say what to do next. */
export class FlasherError extends Error {
  override name = 'FlasherError';
}

export class DisconnectedError extends FlasherError {
  override name = 'DisconnectedError';
  constructor(cause?: unknown) {
    super('The board was disconnected. Plug it back in, then connect again.', { cause });
  }
}

export class ProtocolError extends FlasherError {
  override name = 'ProtocolError';
}

export class CancelledError extends FlasherError {
  override name = 'CancelledError';
  constructor(message = 'Upload cancelled.') {
    super(message);
  }
}
