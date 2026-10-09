export interface SemanticAssistant {
  readonly enabled: boolean;
  describeStoredMotion(gestureId: string): Promise<string>;
}

export class DisabledSemanticAssistant implements SemanticAssistant {
  readonly enabled = false;

  async describeStoredMotion(_gestureId: string): Promise<string> {
    throw new Error('V1 未啟用 VLM；個人名稱與已儲存動作是唯一權威資料');
  }
}
