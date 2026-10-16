import { readModelFamily, type ModelFamily } from "./format";

interface ModelTone {
  /** Theme token names (without the `--color-` prefix): the base tone and its label colour. */
  base: string;
  label: string;
  /** Tailwind classes for the DOM badge. */
  badge: string;
}

type ToneKey = ModelFamily | "other";

export const MODEL_TONES: Record<ToneKey, ModelTone> = {
  opus: { base: "opus", label: "opus-text", badge: "border-opus/50 bg-opus/16 text-opus-text" },
  sonnet: { base: "sonnet", label: "sonnet-text", badge: "border-sonnet/45 bg-sonnet/16 text-sonnet-text" },
  haiku: { base: "haiku", label: "haiku-text", badge: "border-haiku/45 bg-haiku/14 text-haiku-text" },
  fable: { base: "fable", label: "fable-text", badge: "border-fable/50 bg-fable/16 text-fable-text" },
  other: { base: "sonnet", label: "sonnet-text", badge: "border-sonnet/45 bg-sonnet/16 text-sonnet-text" },
};

export function readToneKey(model: string): ToneKey {
  return readModelFamily(model) ?? "other";
}
