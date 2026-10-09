import type { Vec3 } from './types';

export const EPSILON = 1e-8;

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: Vec3, amount: number): Vec3 => [a[0] * amount, a[1] * amount, a[2] * amount];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export function normalize3(a: Vec3): Vec3 {
  const length = norm3(a);
  if (!Number.isFinite(length) || length < EPSILON) throw new Error('向量長度退化');
  return scale3(a, 1 / length);
}
export const distance3 = (a: Vec3, b: Vec3): number => norm3(sub3(a, b));
export const distance2 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a: number, b: number, amount: number): number => a + (b - a) * amount;
export const lerp3 = (a: Vec3, b: Vec3, amount: number): Vec3 => [
  lerp(a[0], b[0], amount),
  lerp(a[1], b[1], amount),
  lerp(a[2], b[2], amount),
];

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('無法計算空集合的中位數');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function mse(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index] - b[index];
    sum += delta * delta;
  }
  return sum / a.length;
}

export function isFiniteVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}
