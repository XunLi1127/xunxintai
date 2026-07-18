export type PetState = 'idle' | 'thinking' | 'tool_running' | 'awaiting_confirmation' | 'completed' | 'failed' | 'sleeping';
export interface PetSettings { position?: { x: number; y: number }; size?: number; muted?: boolean; clickThrough?: boolean; doNotDisturb?: boolean }
export interface PetStatus { state: PetState; running: boolean; retryCount: number }
export interface PetApi {
  getStatus(): Promise<PetStatus>;
  start(): Promise<{ ok: boolean; state?: PetState; code?: string; message?: string }>;
  stop(): Promise<{ ok: boolean; state: PetState }>;
  updateSettings(settings: PetSettings): Promise<PetSettings>;
  exportDiagnostics(): Promise<Record<string, string | number | null>>;
}
