export class MotionDataError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_SAMPLE'
      | 'INVALID_LANDMARKS'
      | 'INVALID_TIME'
      | 'ZERO_SCALE'
      | 'TRACKING_GAP'
      | 'INCOMPATIBLE_MODE'
      | 'NO_TEMPLATE',
  ) {
    super(message);
    this.name = 'MotionDataError';
  }
}

export function userMessage(error: unknown): string {
  if (error instanceof MotionDataError) return error.message;
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return '攝影機權限被拒絕。請在瀏覽器網站設定中允許攝影機後重試。';
  }
  if (error instanceof Error) return error.message;
  return '發生無法識別的錯誤，請重試。';
}
