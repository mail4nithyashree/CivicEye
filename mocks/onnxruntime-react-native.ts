// Safe mock for onnxruntime-react-native when native module is unavailable (Expo Go / web)
export class InferenceSession {
  static async create(): Promise<InferenceSession> {
    throw new Error('ONNX native module not available');
  }
  get inputNames(): string[] { return []; }
  get outputNames(): string[] { return []; }
  async run(): Promise<Record<string, never>> { return {}; }
  async release(): Promise<void> {}
}

export class Tensor {
  constructor(
    public type: string,
    public data: Float32Array,
    public dims: number[]
  ) {}
}
