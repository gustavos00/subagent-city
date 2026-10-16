import { formatModelName } from "../lib/format";
import { MODEL_TONES, readToneKey } from "../lib/modelTones";

export function ModelBadge({ model }: { model: string }) {
  const name = formatModelName(model);
  if (!name) return null;
  return (
    <span
      title="Model"
      className={`inline-block rounded-full border px-2 py-px text-[11px] font-semibold whitespace-nowrap ${MODEL_TONES[readToneKey(model)].badge}`}
    >
      {name}
    </span>
  );
}
