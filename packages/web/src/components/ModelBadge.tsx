import { formatModelName, readModelFamily } from "../lib/format";

const TONES = {
  opus: "border-opus/50 bg-opus/16 text-opus-text",
  haiku: "border-haiku/45 bg-haiku/14 text-haiku-text",
  sonnet: "border-sonnet/45 bg-sonnet/16 text-sonnet-text",
};

export function ModelBadge({ model }: { model: string }) {
  const name = formatModelName(model);
  if (!name) return null;
  const family = readModelFamily(model);
  const tone = family === "opus" || family === "haiku" ? TONES[family] : TONES.sonnet;
  return (
    <span
      title="Model"
      className={`inline-block rounded-full border px-2 py-px text-[11px] font-semibold whitespace-nowrap ${tone}`}
    >
      {name}
    </span>
  );
}
